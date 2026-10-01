import { reactive } from 'vue'
import { getExamTask, getQuestionAnalysis } from '@/api/exam'
import { analysisWrongQuestions, getExamReview } from './examReview'
import { request, unwrapResult } from '@/utils/request'
import { accountKey, localGet, localPut } from './localData'
import { fetchQstHtml } from '@/api/mistake'
import { parseQuestionHtml } from './questionHtml'
import { renderQuestion } from './mistakePdf'
import { uploadFile } from './oss'

export interface LocalMistake {
  id: string; examId: number; questionId: number; isRelatedGroup: boolean
  subject: string; source: string; number: string; creationTime: string
  stem: string; answer: string; analysis: string; stemShoot: string
  earned: number; full: number; sync: 'pending' | 'synced'; syncError?: string
}
export const mistakeSyncState = reactive({ busy: false, message: '', revision: 0 })
export async function listLocalMistakes(key = accountKey()): Promise<LocalMistake[]> {
  return await localGet<LocalMistake[]>('mistakes|' + key) || []
}
export function gradedWrongQuestions(task: any): any[] {
  // GetExamTask is scoped by the official API to the authenticated student.
  // Never infer personal results from a class's errorCount or missing/unreleased marks.
  if (task?.enableScore !== true) return []
  return (task.groups || []).flatMap((g: any) => g.questions || []).filter((q: any) => {
    const earned = q.originScore
    // completed also describes completion of revisions in the official client.
    // A released, non-null original score is the evidence of grading.
    return Number.isSafeInteger(q.id) && q.id > 0 &&
      typeof earned === 'number' && Number.isFinite(earned) && earned >= 0 &&
      typeof q.score === 'number' && Number.isFinite(q.score) && q.score > 0 && earned < q.score
  })
}
function ensureAccount(key: string, signal?: AbortSignal) {
  if (signal?.aborted || accountKey() !== key) throw new Error('错题同步已取消或账号已切换')
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('题目截图失败')), 'image/png'))
}
async function officialView(examId: number, questionId: number, related: boolean, signal?: AbortSignal): Promise<any[]> {
  const endpoint = related ? 'GetRelatedQstViewAsync' : 'GetQuestionViewAsync'
  const param = related ? 'relatedGroupId' : 'questionId'
  const result = unwrapResult(await request(`/api/services/app/Task/${endpoint}?examId=${examId}&${param}=${questionId}`, { signal }))
  return related ? (Array.isArray(result) ? result : []) : result ? [result] : []
}
export async function syncExamMistakes(taskId: number, key: string, signal?: AbortSignal, reviewedIds?: number[]) {
  ensureAccount(key, signal)
  const task = await getExamTask(taskId, signal)
  ensureAccount(key, signal)
  const examId = task.examId
  if (!Number.isSafeInteger(examId) || examId <= 0) throw new Error('测评缺少有效 examId')
  const snapshot = getExamReview(taskId, key)
  if (!reviewedIds && snapshot && snapshot.examId !== examId) throw new Error('作业已更新，请刷新新测评重新识别')
  const review = reviewedIds ?? snapshot?.questionIds
  if (!review) throw new Error('请先在新测评页面完成自动识别')
  const analysis = await getQuestionAnalysis(examId, signal)
  ensureAccount(key, signal)
  const detected = analysisWrongQuestions(task, analysis, key.slice(key.lastIndexOf('|') + 1))
  if (detected.unmatched) throw new Error('题目分析存在无法匹配的题目，请刷新后重试')
  const wrong = detected.questions.filter(q => review.includes(q.id))
  let entries = await listLocalMistakes(key)
  let saved = 0
  const seen = new Set<string>()
  for (const q of wrong) {
    ensureAccount(key, signal)
    const related = q.answerByGroup === true && Number.isSafeInteger(q.relatedGroupId) && q.relatedGroupId > 0
    const questionId = related ? q.relatedGroupId : q.id
    const id = `local:${examId}:${related ? 'group' : 'q'}:${questionId}`
    if (seen.has(id)) continue
    seen.add(id)
    let item = entries.find(e => e.id === id)
    const views = await officialView(examId, questionId, related, signal)
    ensureAccount(key, signal)
    if (!views.length) throw new Error('官方题目详情为空，未进行同步')
    const alreadyAdded = views.every(v => v.isInMistakeBook === true)
    if (!item) {
      const parts = []
      for (const view of views) {
        if (!view.path) throw new Error('题目没有可读取的题干，未进行同步')
        parts.push(parseQuestionHtml(await fetchQstHtml(view.path, signal)))
        ensureAccount(key, signal)
      }
      if (!parts.some(p => p.stem)) throw new Error('题干解析为空，未进行同步')
      item = { id, examId, questionId, isRelatedGroup: related,
        subject: task.topicName || '未分类', source: task.examName || '测评错题', number: String(q.number || q.name || ''),
        creationTime: new Date().toISOString(), stem: parts.map(p => p.stem).join('<hr>'),
        answer: parts.map(p => p.answer).join('<hr>'), analysis: parts.map(p => p.analysis).join('<hr>'),
        stemShoot: '', earned: q.originScore, full: q.score, sync: alreadyAdded ? 'synced' : 'pending' }
      entries.push(item)
      await localPut('mistakes|' + key, entries); mistakeSyncState.revision++
    }
    if (alreadyAdded) { item.sync = 'synced'; delete item.syncError }
    else {
      // Recheck official membership on EVERY retry, including after an ambiguous POST timeout.
      try {
        if (!item.stemShoot) {
          const canvas = await renderQuestion({ title: item.source + ' · ' + item.number, stem: item.stem }, false, signal)
          const screenshot = await canvasBlob(canvas); canvas.width = canvas.height = 0
          ensureAccount(key, signal)
          const userId = key.slice(key.lastIndexOf('|') + 1)
          item.stemShoot = await uploadFile(screenshot, userId, 'mistake_v2', crypto.randomUUID(), 'stem.png')
          ensureAccount(key, signal)
          await localPut('mistakes|' + key, entries)
        }
        ensureAccount(key, signal)
        await request('/api/services/app/MistakeBook/AddInMistakeBookAsync', { method: 'POST', signal,
          body: JSON.stringify({ examId, isRelatedGroup: related, questionId, extraStems: [],
            stemShoot: item.stemShoot, diff: null, attainedLevel: null, errorReason: null, tagIdList: [] }) })
        ensureAccount(key, signal)
        item.sync = 'synced'; delete item.syncError; saved++
      } catch (e) {
        ensureAccount(key, signal)
        item.sync = 'pending'; item.syncError = (e as Error).message
      }
    }
    await localPut('mistakes|' + key, entries); mistakeSyncState.revision++
  }
  return { total: seen.size, saved, pending: entries.filter(e => seen.has(e.id) && e.sync === 'pending').length }
}

/** A single queue prevents overlapping auto/import actions and concurrent local writes. */
export async function collectExamTasks(tasks: any[], signal?: AbortSignal) {
  const key = accountKey()
  while (mistakeSyncState.busy) { ensureAccount(key, signal); await new Promise(resolve => setTimeout(resolve, 100)) }
  ensureAccount(key, signal); mistakeSyncState.busy = true
  let errors = 0, pending = 0
  try {
    for (let index = 0; index < tasks.length; index++) {
      ensureAccount(key, signal)
      mistakeSyncState.message = `正在核对本人错题 ${index + 1}/${tasks.length}：${tasks[index].examName || ''}`
      try {
        const id = Number(tasks[index].examTaskId || tasks[index].id)
        if (!Number.isSafeInteger(id) || id <= 0) continue
        const result = await syncExamMistakes(id, key, signal); pending += result.pending
      } catch (e) { ensureAccount(key, signal); errors++; mistakeSyncState.message = (e as Error).message }
    }
    mistakeSyncState.message = `本人错题核对完成${pending ? `，${pending} 题待同步官方` : ''}${errors ? `，${errors} 个测评未能读取` : ''}`
  } catch (error) {
    if (signal?.aborted) mistakeSyncState.message = '核对已停止，已保存的本地记录保留'
    throw error
  } finally { mistakeSyncState.busy = false; mistakeSyncState.revision++ }
}

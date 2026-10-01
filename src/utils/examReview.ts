import { reactive } from 'vue'
import { accountKey, localGet, localPut } from './localData'

export interface ExamReview {
  taskId: number; examId: number; name: string; questionIds: number[]
  numbers: string[]; unmatched: number; checkedAt: string; message?: string
}
export const examReviews = reactive<Record<string, ExamReview>>({})
const storageKey = (key: string, taskId: number) => `exam-review|${key}|${taskId}`

/** Official analysis exposes questionId and errorStudents (student user IDs).
 * Never use class errorCount, student names or original/revised scores as membership evidence.
 * A child error belongs to its enclosing question when the child has no task-level ID.
 */
export function analysisWrongQuestions(task: any, data: any, studentId: string) {
  if (!studentId) throw new Error('无法识别当前学生 ID，请重新登录')
  if (!Array.isArray(data?.testGroupAnalysis)) throw new Error('官方未返回题目分析，不能判断本人错题')
  const questions: any[] = (task.groups || []).flatMap((g: any) => g.questions || [])
  const byId = new Map(questions.map(q => [Number(q.id), q]))
  const selected = new Map<number, any>(); let unmatched = 0
  function visit(node: any, parent?: any) {
    const id = Number(node.questionId)
    const question = byId.get(id) || parent
    const personalError = Array.isArray(node.errorStudents) && node.errorStudents.some((s: any) =>
      String(typeof s === 'object' && s !== null ? s.studentUserId ?? s.studentId ?? s.id : s) === studentId)
    if (personalError) {
      if (question && Number.isSafeInteger(question.id) && question.id > 0) selected.set(question.id, question)
      else unmatched++
    }
    for (const child of node.childrenAnalysis || []) visit(child, question)
  }
  for (const group of data.testGroupAnalysis) for (const node of group.testQuestionAnalysis || []) visit(node)
  return { questions: [...selected.values()], unmatched }
}

export async function saveExamReview(taskId: number, task: any, data: any, key = accountKey(), signal?: AbortSignal) {
  if (signal?.aborted || accountKey() !== key) throw new Error('识别已取消或账号已切换')
  const result = analysisWrongQuestions(task, data, key.slice(key.lastIndexOf('|') + 1))
  const review: ExamReview = { taskId, examId: task.examId, name: task.examName || '测评',
    questionIds: result.questions.map(q => q.id), numbers: result.questions.map(q => String(q.number ?? q.name ?? q.id)),
    unmatched: result.unmatched, checkedAt: new Date().toISOString() }
  await localPut(storageKey(key, taskId), review)
  if (signal?.aborted || accountKey() !== key) throw new Error('识别已取消或账号已切换')
  examReviews[storageKey(key, taskId)] = review
  return review
}
export function getExamReview(taskId: number, key = accountKey()) { return examReviews[storageKey(key, taskId)] }
export async function loadExamReviews(ids: number[], key = accountKey()) {
  for (const id of ids) {
    const review = await localGet<ExamReview>(storageKey(key, id))
    if (accountKey() !== key) return
    if (review) examReviews[storageKey(key, id)] = review
  }
}
export async function setExamReviewMessage(taskId: number, message: string, key = accountKey()) {
  const review = getExamReview(taskId, key)
  if (!review || accountKey() !== key) return
  review.message = message
  await localPut(storageKey(key, taskId), { ...review, questionIds: [...review.questionIds], numbers: [...review.numbers] })
}

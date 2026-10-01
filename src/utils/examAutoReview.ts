import { getExamTask, getQuestionAnalysis } from '@/api/exam'
import { saveExamReview } from './examReview'
import { accountKey } from './localData'

/** Read-only recognition; official writes still require the per-task import button. */
export async function detectExamReview(taskId: number, key: string, signal?: AbortSignal) {
  const assertCurrent = () => {
    if (signal?.aborted || accountKey() !== key) throw new Error('识别已取消或账号已切换')
  }
  assertCurrent()
  const task = await getExamTask(taskId, signal)
  assertCurrent()
  const examId = Number(task?.examId)
  if (!Number.isSafeInteger(examId) || examId <= 0) throw new Error('测评缺少有效 examId')
  const data = await getQuestionAnalysis(examId, signal)
  assertCurrent()
  return saveExamReview(taskId, { ...task, examId }, data, key, signal)
}

export interface RecognitionState {
  status: 'waiting' | 'reading' | 'ready' | 'error'
  error?: string
}

/** A bounded sequential queue avoids bursts against the school API. */
export async function recognizeExamTasks(
  ids: number[], key: string, signal: AbortSignal,
  onState: (id: number, state: RecognitionState) => void,
  onProgress: (done: number, total: number) => void
) {
  const unique = [...new Set(ids)]
  const assertCurrent = () => {
    if (signal.aborted || accountKey() !== key) throw new Error('识别已取消或账号已切换')
  }
  let done = 0
  for (const id of unique) {
    assertCurrent()
    onState(id, {status:'reading'})
    try {
      await detectExamReview(id, key, signal)
      assertCurrent()
      onState(id, {status:'ready'})
    } catch (error) {
      assertCurrent()
      onState(id, {status:'error', error:(error as Error).message})
    }
    onProgress(++done, unique.length)
  }
}

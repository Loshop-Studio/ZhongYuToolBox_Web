/**
 * 新测评模块接口层（复刻旧项目 index.js 测评相关函数）
 * 接口基地址：API_BASE_URL
 */
import { request, unwrapResult } from '@/utils/request'

const PAGE_SIZE = 20

function validId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('无效的测评或题目编号')
  return id
}

/** 测评任务列表项 */
export interface ExamTask {
  examId?: number
  testPagerId?: number
  id?: number
  examTaskId?: number
  examName?: string
  examState?: number
  [key: string]: any
}

/** 分页拉取学生测评任务列表（复刻 fetchExams） */
export async function getExamTasks(page: number, signal?: AbortSignal, taskListType = 4): Promise<{ items: ExamTask[]; totalCount: number }> {
  const skipCount = (page - 1) * PAGE_SIZE
  const resp = await request<any>('/api/services/app/Task/GetStudentTaskListAsync', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      maxResultCount: PAGE_SIZE,
      skipCount,
      taskListType
    })
  })
  const result = unwrapResult<any>(resp)
  return {
    items: result.items || [],
    totalCount: result.totalCount || 0
  }
}

/** 测评任务详情（含题目分组）（复刻 fetchExamTask） */
export async function getExamTask(examId: number, signal?: AbortSignal): Promise<any> {
  const resp = await request<any>(`/api/services/app/Task/GetExamTaskAsync?id=${validId(examId)}`, {signal})
  return unwrapResult<any>(resp)
}

/** 单题 HTML（含解析）（复刻 fetchQstAnswerView） */
export async function getQstAnswerView(qstId: number, signal?: AbortSignal): Promise<string> {
  const resp = await request<Response>(`/Question/View/${validId(qstId)}?showAnalysis=true`, {
    raw: true, signal
  })
  // raw 模式下 request 返回原始 Response，需自行读取文本
  if (resp instanceof Response) {
    return await resp.text()
  }
  return String(resp)
}

/** 考试概览（复刻 fetchExamOverview） */
export async function getExamOverview(examId: number, signal?: AbortSignal): Promise<any> {
  const resp = await request<any>(
    `/api/services/app/LearningSituations/GetExamOverviewAsync?examId=${validId(examId)}`,
    {
      signal, headers: {
        AppName: 'WebClient',
        AppVersion: '0'
      }
    }
  )
  return unwrapResult<any>(resp)
}

/** 题目分析（复刻 fetchQuestionAnalysis） */
export async function getQuestionAnalysis(examId: number, signal?: AbortSignal): Promise<any> {
  const resp = await request<any>(
    `/api/services/app/LearningSituations/GetQuestionAnalysisAsync?examId=${validId(examId)}`,
    {
      signal, headers: {
        AppName: 'WebClient',
        AppVersion: '0'
      }
    }
  )
  return unwrapResult<any>(resp)
}

/** 导出客观题答案 xlsx（复刻 exportObjectiveAnswers），返回 Blob */
export async function exportObjectiveAnswers(examId: number): Promise<Blob> {
  const resp = await request<Response>(
    `/api/services/app/Exam/ExportObjectiveAnswersAsync?examId=${validId(examId)}`,
    {
      headers: {
        AppName: 'WebClient',
        AppVersion: '0'
      },
      raw: true
    }
  )
  return await (resp as Response).blob()
}

/** 解析单题 HTML，提取题干/答案/解析/知识点（复刻 showExamQuestions 内解析） */
export interface ParsedQuestion {
  number: number
  stem: string
  answer: string
  explanation: string
  knowledge: string
}

export async function parseExamQuestions(
  exam: any,
  getHtml: (qstId: number) => Promise<string>,
  signal?: AbortSignal
): Promise<ParsedQuestion[]> {
  const questions: ParsedQuestion[] = []
  let idx = 1
  // getExamTask 已 unwrapResult，传入的是 resp.result（含 groups）；兼容仍带 .result 的写法
  const groups = exam?.groups || exam?.result?.groups || []
  for (const group of groups) {
    for (const q of group.questions || []) {
      if (signal?.aborted) throw new DOMException('已取消题目加载', 'AbortError')
      const content = await getHtml(q.id)
      if (signal?.aborted) throw new DOMException('已取消题目加载', 'AbortError')
      const parser = new DOMParser()
      const doc = parser.parseFromString(content, 'text/html')
      doc.querySelectorAll('.toolBar').forEach((el) => el.remove())

      const stem = doc.querySelector('.stem')?.innerHTML || ''

      let answer = ''
      const answerEl = doc.querySelector('.answers')
      if (answerEl) {
        answerEl.querySelectorAll('h3').forEach((h) => h.remove())
        answer = answerEl.innerHTML.trim()
      }

      let explanation = ''
      let knowledge = ''
      const analysisEls = doc.querySelectorAll('.analysis')
      if (analysisEls.length > 0) {
        const first = analysisEls[0]
        first.querySelectorAll('h3').forEach((h) => h.remove())
        explanation = first.innerHTML.trim()
        if (analysisEls[1]) {
          const second = analysisEls[1]
          second.querySelectorAll('h3').forEach((h) => h.remove())
          knowledge = second.innerHTML.trim()
        }
      }

      questions.push({ number: idx, stem, answer, explanation, knowledge })
      idx++
    }
  }
  return questions
}

export { PAGE_SIZE }

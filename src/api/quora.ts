import { resourceFetchUrl } from '@/utils/proxy'
/**
 * 随身答接口（复刻 index.js quesInit / ques_query / previewQuestion）
 */
import { reactive } from 'vue'
import { request } from '@/utils/request'

export interface QuoraCatalog {
  id: number | string
  name: string
  [k: string]: any
}

export interface QuoraSession {
  id: string | number
  askUserName: string
  askUserPhoto?: string
  summary: string
  snapshot: string
  topicName?: string
  class?: string
  unRead?: boolean
  [k: string]: any
}

export interface QuoraMessage {
  id?: string | number
  sessionId?: string | number
  userName: string
  sendTime: string
  snapShot: string
  content: string
  isPrimary?: boolean
  [k: string]: any
}

export interface QuoraQueryParams {
  keyword: string
  catalogId: number
  topicId: number
  orderBy: number
  skip: number
  take: number
  updateTime: { start: string; end: string }
  joinTime: { start: string; end: string }
  justWatch: number[]
}

/** 获取领域（catalog）列表 */
export async function getCatalogs(): Promise<QuoraCatalog[]> {
  const resp = await request<{ result: QuoraCatalog[] }>(
    `/api/services/app/Quora/GetCatalogs`,
    { method: 'GET' }
  )
  return resp.result || []
}

/** 获取会话列表（懒加载） */
export async function getSessions(params: QuoraQueryParams): Promise<QuoraSession[]> {
  const resp = await request<{ result: QuoraSession[] }>(
    `/api/services/app/Quora/GetSessions`,
    {
      method: 'POST',
      body: JSON.stringify(params)
    }
  )
  return resp.result || []
}

/** 获取某会话的消息 */
export async function getMessages(sessionId: string | number, skip = 0, take = 1000): Promise<QuoraMessage[]> {
  const resp = await request<{ result: QuoraMessage[] }>(
    `/api/services/app/Quora/GetMessages`,
    {
      method: 'POST',
      body: JSON.stringify({ SessionId: sessionId, Skip: skip, Take: take })
    }
  )
  return resp.result || []
}

/** 重置已读状态 */
export async function resetReadState(sessionId: string | number): Promise<void> {
  await request(
    `/api/services/app/Quora/ResetReadState?sessionId=${sessionId}`,
    { method: 'GET' }
  )
}

/** 分享会话（复用全局 share 能力，这里仅占位返回参数） */
export function buildSharePayload(sessionId: string | number) {
  return { type: 'quora', id: sessionId, title: '随身答对话' }
}

/** 发送画板回复（复刻 boardModal btnExport → Quora/AddMessage） */
export async function addMessage(content: string, sessionId: string | number, snapshot: string): Promise<void> {
  await request(`/api/services/app/Quora/AddMessage`, {
    method: 'POST',
    body: JSON.stringify({ content, sessionId, snapshot })
  })
}

/**
 * 跨组件共享的“已读”状态：进入详情并调用 resetReadState 成功后，
 * 把 sessionId 记入映射，列表卡片据此隐藏“未读”角标（列表被 keep-alive 缓存，不会自动刷新）。
 * 用普通对象映射而非 Set，避免响应式集合的追踪问题。
 */
export const readSessionState = reactive<Record<string, boolean>>({})

export function markSessionRead(id: string | number): void {
  readSessionState[String(id)] = true
}

export async function fetchContentBlob(contentUrl: string, signal?: AbortSignal): Promise<Blob> {
  if (!contentUrl) throw new Error('缺少画板资源地址')
  const response = await fetch(resourceFetchUrl(contentUrl), { signal })
  if (!response.ok) throw new Error(`下载画板失败：HTTP ${response.status}`)
  return response.blob()
}

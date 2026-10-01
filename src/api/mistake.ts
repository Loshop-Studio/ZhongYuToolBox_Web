/**
 * 错题本接口（复刻 index.js mistake_query / GetMistakeQstItemDetailInfoAsync）
 */
import { request } from '@/utils/request'
import { API_BASE_URL } from '@/config'
import { proxyUrl } from '@/utils/proxy'

export interface MistakeItem {
  id: string | number
  source: string
  stemShoot: string
  creationTime: string
  [k: string]: any
}

export interface MistakeBook {
  id: string | number
  topic: { content: string }
  [k: string]: any
}

export interface MistakeSearchResult {
  items: MistakeItem[]
  totalCount: number
}

/** 获取我的错题本列表（复刻 mistakeInit / GetMyMistakeBooksAsync） */
export async function getMyMistakeBooks(): Promise<MistakeBook[]> {
  const resp = await request<{ result: MistakeBook[] }>(
    `/api/services/app/MistakeBook/GetMyMistakeBooksAsync`,
    { method: 'GET' }
  )
  return resp.result || []
}

/** 搜索错题列表（按 bookId 筛选） */
export async function searchMistakes(bookId: string | number, skipCount = 0, maxResultCount = 200): Promise<MistakeSearchResult> {
  const resp = await request<{ result: MistakeSearchResult }>(
    `/api/services/app/MistakeBook/SearchMistakeQstItemsAsync`,
    {
      method: 'POST',
      body: JSON.stringify({
        attainedLevel: [],
        bookId,
        diff: [],
        errorReason: [],
        haveNoTag: false,
        maxResultCount,
        skipCount,
        tagIdList: []
      })
    }
  )
  return resp.result
}

export interface MistakeDetail {
  qstPath?: string
  note?: string
  pictureNote?: string[]
  [k: string]: any
}

/** 获取错题详情（result 为 null 时返回 null，由调用方判断） */
export async function getMistakeDetail(itemId: string | number): Promise<MistakeDetail | null> {
  const resp = await request<{ result: MistakeDetail | null }>(
    `/api/services/app/MistakeBook/GetMistakeQstItemDetailInfoAsync?itemId=${itemId}`,
    { method: 'GET' }
  )
  return resp.result || null
}

/** 获取题目 HTML（qstPath 拼接后 fetch 纯文本） */
export async function fetchQstHtml(qstPath: string, signal?: AbortSignal): Promise<string> {
  const host = localStorage.getItem('apiBaseUrl') || API_BASE_URL
  const url = new URL(qstPath, host.replace(/\/$/, '') + '/')
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('题目地址无效')
  url.searchParams.set('showAnalysis', 'true')
  const resp = await fetch(url.href, {
    signal,
    headers: url.origin === new URL(host).origin ? { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } : {}
  })
  if (!resp.ok) throw new Error('题目读取失败：' + resp.status)
  return resp.text()
}

/** 笔记截图：fileList.json → screenshot.png */
export async function fetchNoteScreenshot(noteUrl: string): Promise<string | null> {
  try {
    const flResp = await fetch(proxyUrl(noteUrl))
    if (!flResp.ok) return null
    const fileList = await flResp.json()
    const pngEntry = (fileList || []).find(
      (f: any) => f.url && f.url.toLowerCase().endsWith('screenshot.png')
    )
    if (!pngEntry) return null
    return proxyUrl(pngEntry.url)
  } catch {
    return null
  }
}

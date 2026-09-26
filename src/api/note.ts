/**
 * 云笔记接口（复刻 index.js 中 loadNotes/searchNotes/noteGetAll/noteDownload 等）
 *
 * 说明：
 * - 登录后 API 基地址会变为学校特定服务器，故此处动态从 localStorage 读取，
 *   而非使用 config 中加载时固化的常量。
 * - 云笔记服务路径有两种：省锡中（zyapi.loshop.com.cn）走 /special/ 代理路径，
 *   其它学校走直连 /CloudNotes/api/Notes|Resources/ 路径。
 * - 内嵌 App（electron / plus）统一走直连路径，不依赖 /special/ 代理；其路径
 *   自适应登录所用的服务器 base（登录同样直连该 base），与浏览器模式区分。
 */
import { aesEncrypt, aesDecrypt } from '@/utils/crypto'
import { IS_BROWSER } from '@/config'

/** 当前 API 基地址（登录后可能被替换为学校服务器） */
function apiBase(): string {
  return localStorage.getItem('apiBaseUrl') || 'https://zyapi.loshop.com.cn'
}

/**
 * 是否使用省锡中 special 代理路径（复刻 useSpecialPath）。
 * - 浏览器模式：仅当登录服务器为 zyapi.loshop.com.cn 时使用 /special/。
 * - 内嵌 App（electron / plus）：不使用 /special/，统一直连 CloudNotes 路径。
 */
function useSpecialPath(): boolean {
  if (!IS_BROWSER) return false
  const base = localStorage.getItem('apiBaseOrigin') || apiBase()
  return !!base && base.includes('zyapi.loshop.com.cn')
}

/** 云笔记 Notes 服务路径（复刻 getCloudNoteApiPath） */
function notesPath(endpoint: string, encryptedParams: string): string {
  const base = apiBase()
  const special = `${base}/special/${endpoint}?${encryptedParams}`
  const direct = `${base}/CloudNotes/api/Notes/${endpoint}?${encryptedParams}`
  return useSpecialPath() ? special : direct
}

/** 云笔记 Resources 服务路径（复刻 getCloudNoteApiPathR） */
function resourcesPath(endpoint: string, encryptedParams: string): string {
  const base = apiBase()
  const special = `${base}/special/${endpoint}?${encryptedParams}`
  const direct = `${base}/CloudNotes/api/Resources/${endpoint}?${encryptedParams}`
  return useSpecialPath() ? special : direct
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  }
}

export interface NoteItem {
  fileId: string
  fileName: string
  type: number
  createTime?: string
  updateTime?: string
}

export interface NoteResource {
  ossImageUrl: string
  pageIndex: number
  resourceType: number
}

/** 401 校验 */
function check401(status: number): void {
  if (status === 401) {
    throw new Error('身份失效，请重新登录')
  }
}

/** 按 parentId 获取某文件夹下的笔记/子文件夹（复刻 loadNotes） */
export async function getNotesByParentId(parentId = '0'): Promise<NoteItem[]> {
  const params = `parentid=${parentId}&isNoteNode=true`
  const url = notesPath('GetByParentId', aesEncrypt(params))
  const res = await fetch(url, { headers: authHeaders() })
  check401(res.status)
  const json = await res.json()
  if (json.code !== 0) {
    throw new Error(json.msg || '获取笔记失败')
  }
  const data = JSON.parse(aesDecrypt(json.data))
  return (data.noteList || []) as NoteItem[]
}

/** 获取全部笔记（复刻 noteGetAll 的取数部分，仅保留 type 1/12） */
export async function getAllNotes(): Promise<NoteItem[]> {
  const res = await fetch(`${apiBase()}/CloudNotes/api/Notes/GetAll`, {
    method: 'GET',
    headers: authHeaders()
  })
  check401(res.status)
  const json = await res.json()
  // 响应体的 data 字段为 AES 加密内容，需解密后才能取 noteList
  const data = JSON.parse(aesDecrypt(json.data))
  const list: NoteItem[] = data.noteList || []
  return list.filter((item) => item.type === 1 || item.type === 12)
}

/** 关键词搜索笔记（复刻 searchNotes，仅保留 type 1/12） */
export async function searchNotes(fileName: string): Promise<NoteItem[]> {
  const query = `fileName=${fileName}`
  const url = notesPath('Search', aesEncrypt(query))
  const res = await fetch(url, { method: 'GET', headers: authHeaders() })
  check401(res.status)
  let data = await res.json()
  data = JSON.parse(aesDecrypt(data.data))
  const list: NoteItem[] = data.noteList || []
  return list.filter((item) => item.type === 1 || item.type === 12)
}

/** 按 fileId 获取笔记的图片资源列表（复刻 noteDownload 取数部分） */
export async function getNoteResources(fileId: string): Promise<NoteResource[]> {
  const url = resourcesPath('GetByFileId', aesEncrypt('fileId=' + fileId))
  const res = await fetch(url, { method: 'GET', headers: authHeaders() })
  check401(res.status)
  const data = await res.json()
  return (JSON.parse(aesDecrypt(data.data)).resourceList || []) as NoteResource[]
}

/** 获取全部资源用于打包下载（复刻 noteDownload2 取数部分，路径自适应 special / 直连） */
export async function getNoteResourcesForZip(fileId: string): Promise<NoteResource[]> {
  const url = resourcesPath('GetByFileId', aesEncrypt('fileId=' + fileId))
  const res = await fetch(url, { method: 'GET', headers: authHeaders() })
  check401(res.status)
  const data = await res.json()
  return (JSON.parse(aesDecrypt(data.data)).resourceList || []) as NoteResource[]
}

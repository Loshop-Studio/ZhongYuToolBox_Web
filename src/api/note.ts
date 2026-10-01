/** Official CloudNotes API; no author proxy. */
import { aesEncrypt, aesDecrypt } from '@/utils/crypto'


/** 当前 API 基地址（登录后可能被替换为学校服务器） */
function apiBase(): string {
  return localStorage.getItem('apiBaseUrl') || 'http://sxz.api.zykj.org'
}



/** 云笔记 Notes 服务路径（复刻 getCloudNoteApiPath） */
function notesPath(endpoint: string, encryptedParams: string): string {
  const base = apiBase()
  const direct = `${base}/CloudNotes/api/Notes/${endpoint}?${encryptedParams}`
  return direct
}

/** 云笔记 Resources 服务路径（复刻 getCloudNoteApiPathR） */
function resourcesPath(endpoint: string, encryptedParams: string): string {
  const base = apiBase()
  const direct = `${base}/CloudNotes/api/Resources/${endpoint}?${encryptedParams}`
  return direct
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
  [key: string]: any
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
  return (data.noteList || []).filter((item: NoteItem) => !item.isRecycleBin) as NoteItem[]
}

/** 获取全部笔记（复刻 noteGetAll 的取数部分，仅保留 type 1/12） */
export async function getAllNotes(): Promise<NoteItem[]> {
  const res = await fetch(`${apiBase()}/CloudNotes/api/Notes/GetAll`, {
    method: 'GET',
    headers: authHeaders()
  })
  check401(res.status)
  const json = await res.json()
  if (!res.ok || json.code !== 0) throw new Error(json.msg || '获取笔记失败')
  // 响应体的 data 字段为 AES 加密内容，需解密后才能取 noteList
  const data = JSON.parse(aesDecrypt(json.data))
  const list: NoteItem[] = data.noteList || []
  return list.filter((item) => !item.isRecycleBin && (item.type === 1 || item.type === 12))
}

async function mutateNote(endpoint: string, payload: unknown): Promise<any> {
  const res = await fetch(`${apiBase()}/CloudNotes/api/Notes/${endpoint}`, {
    method: 'POST', headers: authHeaders(), body: aesEncrypt(JSON.stringify(payload))
  })
  check401(res.status)
  const json = await res.json()
  if (!res.ok || json.code !== 0) throw new Error(json.msg || '笔记操作失败')
  return json.data ? JSON.parse(aesDecrypt(json.data)) : null
}

/** Official contract: encrypted array, never Notes/Delete (permanent deletion). */
export async function moveNotesToRecycleBin(fileIds: string[]): Promise<void> {
  if (!fileIds.length || fileIds.some(id => !id)) throw new Error('笔记 ID 无效')
  await mutateNote('MoveToRecycleBin', fileIds)
}

export function buildRenamePayload(note: NoteItem, name: string) {
  if (!name.trim()) throw new Error('笔记名称不能为空')
  for (const field of ['fileId', 'fileUrl', 'parentId', 'type', 'version', 'shared', 'isRecycleBin', 'expirationTimeStamp']) {
    if (note[field] === undefined) throw new Error(`笔记缺少 ${field}，请刷新后重试`)
  }
  const payload = { ...note, fileName: name.trim() }
  for (const field of ['noteList', 'createTime', 'updateTime']) delete payload[field]
  return payload
}

export async function renameNote(note: NoteItem, name: string): Promise<void> {
  const data = await mutateNote('Update', buildRenamePayload(note, name))
  if (data?.version !== undefined) note.version = data.version
  note.fileName = name.trim()
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
  return list.filter((item) => !item.isRecycleBin && (item.type === 1 || item.type === 12))
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

import { useAuthStore } from '@/stores/auth'
import { getMistakeDetail, fetchQstHtml, fetchNoteScreenshot } from '@/api/mistake'
import { getExamTask, parseExamQuestions, getQstAnswerView } from '@/api/exam'
import { getCourseDetail, readContent } from '@/api/lesson'
import { getMessages } from '@/api/quora'
import { getNoteResources, getNotesByParentId } from '@/api/note'
import { localGet, localPut, accountKey } from '@/utils/localData'
import { parseQuestionHtml, safeQuestionHtml } from '@/utils/questionHtml'
import { resourceFetchUrl } from '@/utils/proxy'
import { saveBlobFile } from '@/utils/saveFile'
export type ShareResourceType =
  | 'mistake'
  | 'evaluation'
  | 'course'
  | 'chapter'
  | 'quora'
  | 'note'
  | 'note_folder'

export interface CreateSharePayload {
  api_base: string
  resource_type: ShareResourceType
  resource_id: string
  chapter_id?: string
  title?: string
  password?: string
  expires_hours?: number
  max_views?: number
}

export interface CreateShareResult {
  share_id: string
  share_url: string
  has_password: boolean
  expires_at: string | null
}

export interface ShareInfo {
  share_id: string
  resource_type: ShareResourceType
  title: string
  has_password: boolean
  created_at: string
  expires_at: string | null
  view_count: number
  max_views: number
}

export interface ShareContent {
  _meta: {
    share_id: string
    resource_type: ShareResourceType
    title: string
    username: string
    created_at: string
  }
  [key: string]: any
}

export interface MyShareItem {
  share_id: string
  api_base: string
  username: string
  resource_type: ShareResourceType
  resource_id: string
  title: string
  created_at: string
  expires_at: string | null
  view_count: number
  max_views: number
  has_password: number | boolean
}


interface LocalShare { format: 'aoki-share'; version: 1; info: ShareInfo; owner: string; salt?: number[]; iv?: number[]; sealed?: number[]; content?: ShareContent }
async function embedImage(url: string): Promise<string> {
  const response = await fetch(resourceFetchUrl(url))
  if (!response.ok) throw new Error('分享资源读取失败：' + response.status)
  const blob = await response.blob()
  return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob) })
}
async function embedHtml(html: string): Promise<string> {
  const node = document.createElement('div'); node.innerHTML = safeQuestionHtml(html)
  for (const image of [...node.querySelectorAll('img')]) image.src = await embedImage(image.src)
  return node.innerHTML
}
async function snapshot(payload: CreateSharePayload): Promise<any> {
  const id = payload.resource_id
  switch (payload.resource_type) {
    case 'mistake': {
      const detail = await getMistakeDetail(id)
      if (!detail) throw new Error('错题不存在')
      const parsed = detail.qstPath ? parseQuestionHtml(await fetchQstHtml(detail.qstPath)) : {stem: '', answer: '', analysis: ''}
      const result: any = {stem: await embedHtml(parsed.stem), answers: await embedHtml(parsed.answer), analysis: [await embedHtml(parsed.analysis)], pictureNote: []}
      for (const url of detail.pictureNote || []) result.pictureNote.push(await embedImage(url))
      const screenshot = detail.note ? await fetchNoteScreenshot(detail.note) : detail.stemShoot
      if (screenshot) result.note_screenshot = await embedImage(screenshot)
      return result
    }
    case 'evaluation': {
      const task = await getExamTask(Number(id))
      const questions = await parseExamQuestions(task, getQstAnswerView)
      for (const q of questions) { q.stem = await embedHtml(q.stem); q.answer = await embedHtml(q.answer); q.explanation = await embedHtml(q.explanation) }
      return { title: task.examName, questions }
    }
    case 'course': case 'chapter': {
      const catalogs = await getCourseDetail(id)
      const chapters: any[] = []
      const visit = async (nodes: any[]) => { for (const node of nodes) { if (node.isLeaf && (payload.resource_type === 'course' || node.id === payload.chapter_id)) chapters.push({ title: node.title, content: await embedHtml(await readContent(node.id, id)) }); if (node.children?.length) await visit(node.children) } }
      await visit(catalogs)
      if (!chapters.length) throw new Error('课程或章节为空')
      return { chapters, content: chapters.map(c => '<h3>' + safeQuestionHtml(c.title) + '</h3>' + c.content).join('') }
    }
    case 'quora': {
      const items = await getMessages(id)
      for (const item of items) { if (item.snapShot) item.snapShot = await embedImage(item.snapShot); item.content = await embedHtml(item.content || '') }
      return { items }
    }
    case 'note': case 'note_folder': {
      const ids = payload.resource_type === 'note' ? [id] : (await getNotesByParentId(id)).filter(note => note.type !== 0).map(note => note.fileId)
      const resources = []
      for (const fileId of ids) {
        for (const r of await getNoteResources(fileId)) if (r.resourceType === 0 || r.resourceType === 2) resources.push({...r, ossImageUrl: await embedImage(r.ossImageUrl)})
      }
      return { resourceList: resources }
    }
  }
}
async function passwordKey(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt: Uint8Array.from(salt).buffer, iterations: 210000}, key, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt'])
}
export async function createShare(payload: CreateSharePayload): Promise<CreateShareResult> {
  const owner = accountKey(), auth = useAuthStore()
  const data = await snapshot(payload)
  if (accountKey() !== owner) throw new Error('账号已切换，分享已取消')
  const id = crypto.randomUUID().replace(/-/g, ''), created = new Date().toISOString()
  const info: ShareInfo = {share_id:id,resource_type:payload.resource_type,title:payload.title || payload.resource_type,has_password:!!payload.password,created_at:created,expires_at:payload.expires_hours ? new Date(Date.now()+payload.expires_hours*3600000).toISOString() : null,view_count:0,max_views:0}
  const content: ShareContent = {...data,_meta:{share_id:id,resource_type:payload.resource_type,title:info.title,username:auth.userName,created_at:created}}
  const share: LocalShare = {format:'aoki-share',version:1,info,owner}
  if (payload.password) {
    const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12))
    const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv},await passwordKey(payload.password,salt),new TextEncoder().encode(JSON.stringify(content)))
    share.salt=[...salt];share.iv=[...iv];share.sealed=[...new Uint8Array(sealed)]
  } else share.content=content
  await localPut('share|'+id,share)
  const ids=await localGet<string[]>('shares|'+owner)||[]; await localPut('shares|'+owner,[id,...ids])
  return {share_id:id,share_url:'',has_password:info.has_password,expires_at:info.expires_at}
}
async function getShare(id: string): Promise<LocalShare> {
  const share=await localGet<LocalShare>('share|'+id)
  if (!share) throw new Error('本机没有这个分享，请先导入分享文件')
  if (share.info.expires_at && Date.parse(share.info.expires_at) < Date.now()) throw new Error('分享文件已过期')
  return share
}
export async function getShareInfo(id: string): Promise<ShareInfo> { return (await getShare(id)).info }
export async function accessShare(id: string,password=''): Promise<ShareContent> {
  const share=await getShare(id)
  if (share.content) return sanitizeContent(share.content)
  try {
    const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(share.iv!)},await passwordKey(password,new Uint8Array(share.salt!)),new Uint8Array(share.sealed!))
    return sanitizeContent(JSON.parse(new TextDecoder().decode(bytes)))
  } catch { throw new Error('密码错误或分享文件损坏') }
}
/** Imported files are untrusted. Only passive markup and image URLs reach the viewer. */
function sanitizeContent(value: any, field = '', depth = 0): any {
  if (depth > 32) throw new Error('分享文件结构过深')
  if (typeof value === 'string') {
    if (['stem','answer','answers','analysis','explanation','content','knowledge'].includes(field)) return safeQuestionHtml(value)
    if (['note_screenshot','snapShot','ossImageUrl','pictureNote'].includes(field)) {
      const node = document.createElement('img'); node.setAttribute('src', value)
      const container = document.createElement('div'); container.innerHTML = safeQuestionHtml(node.outerHTML)
      return container.querySelector('img')?.src || ''
    }
    return value
  }
  if (Array.isArray(value)) return value.map(item => sanitizeContent(item, field, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key, sanitizeContent(item,key,depth+1)]))
  return value
}
export async function listMyShares(): Promise<MyShareItem[]> {
  const owner=accountKey(),ids=await localGet<string[]>('shares|'+owner)||[],items=[]
  for (const id of ids) { const share=await localGet<LocalShare>('share|'+id); if(share)items.push({...share.info,api_base:'',username:'',resource_id:id}) }
  return items
}
export async function deleteShare(id: string): Promise<void> {
  const owner=accountKey(), ids=await localGet<string[]>('shares|'+owner)||[]
  await localPut('shares|'+owner,ids.filter(x=>x!==id))
  // Only remove it from this account's list. Shared/imported files are unaffected.
}
export async function exportShare(id: string) {
  const share=await getShare(id)
  // No account ID, server token, or login password is included in the portable file.
  const portable={...share,owner:''}
  await saveBlobFile(new Blob([JSON.stringify(portable)],{type:'application/json'}),share.info.title.replace(/[<>:"/\\|?*]/g,'_')+'.zytbshare')
}
export async function importShare(file: File): Promise<string> {
  if (file.size>64*1024*1024)throw new Error('分享文件超过64MB')
  const share=JSON.parse(await file.text()) as LocalShare
  if (share.format!=='aoki-share'||share.version!==1||!share.info||!['mistake','evaluation','course','chapter','quora','note','note_folder'].includes(share.info.resource_type)||(!share.content&&!share.sealed))throw new Error('不是有效的分享文件')
  const id=crypto.randomUUID().replace(/-/g,'');share.info.share_id=id
  await localPut('share|'+id,{...share,owner:''})
  return id
}

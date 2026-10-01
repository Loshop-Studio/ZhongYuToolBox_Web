/**
 * PDF 上传云笔记：本地页面方向处理、逐页渲染和上传。
 *
 * 流程：本地旋转竖版 -> 加载模板 -> PDF 转图 -> 逐页上传图片与模板并构建
 * resourceList（每页 9 条固定结构）-> Resources/AddOrUpdate -> Notes/AddOrUpdate
 */
import { aesEncrypt } from '@/utils/crypto'
import { uploadFile } from '@/utils/oss'
import { blobToMd5, convertPdfToImages, type PdfPageImage } from '@/utils/pdf'
import { prepareLandscapePdf, type RotationMode } from '@/utils/pdfLandscape'
import { PLATFORM, IS_WINDOWS } from '@/config'
import { NOTE_CANVAS } from '@/utils/noteCanvas'
import { isPlus } from '@/utils/plusPicker'

const TEMPLATE_BASE = 'example/'
const TEMPLATE_UUID = 'a888b5fb-e65d-4611-a3af-1f80a0fb6ced'

/** 图片资源固定文件名（复刻 pdf-upload.js） */
const IMG_FILENAME =
  'B466246B6F67160E63431159941CD9A9screenCaptureb59d24b6-00fa-4f53-bc4f-1df255a5101a.webp'

const TEMPLATE_FILES = [
  'page_router.bin',
  `${TEMPLATE_UUID}/059848e4-1971-47fb-9e47-517266cdef05_matrix.bin`,
  `${TEMPLATE_UUID}/a2b4fb47-3623-45be-9fe9-57fc62e66651_file.bin`,
  `${TEMPLATE_UUID}/e339e39b-64d9-4de0-bfaa-dace2a3f8e7d_command.bin`,
  `${TEMPLATE_UUID}/header.bin`,
  `${TEMPLATE_UUID}/router.bin`,
  `${TEMPLATE_UUID}/screenshot.png`,
  `${TEMPLATE_UUID}/snapshot.bin`
]

let templateFilesCache: Record<string, Blob> | null = null

function apiBase(): string {
  return localStorage.getItem('apiBaseUrl') || 'http://sxz.api.zykj.org'
}

/** 生成自定义 fileId（复刻 generateCustomFileId，须含 g-z 字符） */
export function generateCustomFileId(prefix = 'h', length = 32): string {
  const allChars = '0123456789abcdefghijklmnopqrstuvwxyz'
  for (;;) {
    let body = ''
    for (let i = 0; i < length; i++) {
      body += allChars.charAt(Math.floor(Math.random() * allChars.length))
    }
    if (/[g-z]/.test(body)) return prefix + body
  }
}

/** 生成页 hash（复刻 generatePageHash） */
let lastPageHash = 0
function generatePageHash(): string {
  lastPageHash = Math.max(Date.now(), lastPageHash + 1)
  return String(lastPageHash)
}

/**
 * 5+ 下模板文件在 _www 中的基础前缀。
 * - 旧版纯 5+ App：页面在 _www/，模板即 _www/example/...
 * - uni-app WebView 壳：离线包整体位于 _www/hybrid/html/，模板即 _www/hybrid/html/example/...
 * 若仍用 _www/example/... 会在错误目录查找 -> “解析模板文件失败”。
 */
function wwwTemplateBase(): string {
  const path = window.location.pathname || ''
  return path.includes('/hybrid/html/') ? '_www/hybrid/html/' : '_www/'
}

/**
 * 用 XHR 读取包内 www 资源（相对路径）。
 * 关键：正式 APK 里 www 被打进 APK 的 assets（映射为 _www），不是真实文件系统路径，
 * plus.io.resolveLocalFileSystemURL 打不开（真机调试/自定义基座因资源被解压到磁盘而正常）
 * —— 这正是“运行到手机正常、打包后报解析模板失败”的根因。
 * 改用网络请求方式（App 自身 JS/CSS 就是这么从 www 加载的）即可在打包后照常读取。
 * 本地(file://)读取时状态码常为 0，需一并视为成功。
 */
function xhrReadBlob(url: string, XHRClass: any): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    let xhr: any
    try {
      xhr = new XHRClass()
      xhr.open('GET', url, true)
    } catch (e) {
      reject(e)
      return
    }
    try {
      xhr.responseType = 'arraybuffer'
    } catch {
      /* 个别实现不支持 responseType，忽略 */
    }
    xhr.onload = () => {
      const ok = xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)
      if (!ok) {
        reject(new Error('请求失败 HTTP ' + xhr.status + ' ' + url))
        return
      }
      const buf = xhr.response
      if (!buf) {
        reject(new Error('空响应 ' + url))
        return
      }
      resolve(new Blob([buf]))
    }
    xhr.onerror = () => reject(new Error('请求失败 ' + url))
    xhr.send()
  })
}

/** 依次尝试：5+ 的 XHR -> 原生 XHR -> fetch */
async function readByRequest(url: string): Promise<Blob> {
  const w: any = window as any
  const errors: string[] = []
  const plusXHR = w.plus && w.plus.net && w.plus.net.XMLHttpRequest
  if (plusXHR) {
    try {
      return await xhrReadBlob(url, plusXHR)
    } catch (e: any) {
      errors.push('plus.net.XMLHttpRequest: ' + (e?.message || e))
    }
  }
  if (typeof XMLHttpRequest !== 'undefined') {
    try {
      return await xhrReadBlob(url, XMLHttpRequest)
    } catch (e: any) {
      errors.push('XMLHttpRequest: ' + (e?.message || e))
    }
  }
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    return await resp.blob()
  } catch (e: any) {
    errors.push('fetch: ' + (e?.message || e))
  }
  throw new Error('加载模板文件失败(' + url + ')：' + errors.join(' | '))
}

/** 兜底：5+ 文件系统 API（真机调试/自定义基座可用；正式包 assets 下通常失败） */
function readByPlusIo(plus: any, rel: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(
      wwwTemplateBase() + TEMPLATE_BASE + rel,
      (entry: any) => {
        entry.file(
          (file: any) => {
            const reader = new plus.io.FileReader()
            reader.onloadend = () => {
              try {
                const dataUrl = String(reader.result || '')
                const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
                const bin = atob(b64)
                const bytes = new Uint8Array(bin.length)
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
                resolve(new Blob([bytes], { type: file.type || 'application/octet-stream' }))
              } catch {
                reject(new Error('解析模板文件失败: ' + rel))
              }
            }
            reader.onerror = () => reject(new Error('读取模板文件失败: ' + rel))
            reader.readAsDataURL(file)
          },
          () => reject(new Error('读取模板文件失败: ' + rel))
        )
      },
      () => reject(new Error('解析模板文件失败: ' + rel))
    )
  })
}

/**
 * 读取打包内置的模板文件为 Blob。
 * 主路径改用「相对路径的网络请求」（打包后仍有效，见 xhrReadBlob 注释）；
 * 失败再回退 5+ 文件系统 API（兼容个别环境）。
 */
async function readBundledBlob(rel: string): Promise<Blob> {
  const w: any = window as any
  if (IS_WINDOWS && w.electronAPI?.readNoteTemplate) return new Blob([await w.electronAPI.readNoteTemplate(rel)])
  try {
    return await readByRequest(TEMPLATE_BASE + rel)
  } catch (e) {
    if (w.plus && w.plus.io) {
      return readByPlusIo(w.plus, rel)
    }
    throw e
  }
}

/** 加载模板 bin 文件（复刻 loadTemplateFiles） */
async function loadTemplateFiles(): Promise<Record<string, Blob>> {
  if (templateFilesCache) return { ...templateFilesCache }
  const cache: Record<string, Blob> = {}
  for (const f of TEMPLATE_FILES) {
    cache[f] = await readBundledBlob(f)
  }
  templateFilesCache = cache
  return { ...cache }
}

/** 从 token 解析用户 ID（复刻 pdf-upload.js 的 getUserId） */
function getUserIdFromToken(): string {
  const token = localStorage.getItem('token') || ''
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub || payload.nameid || payload.userId || ''
  } catch {
    return ''
  }
}

/** token 是否有效（复刻 isTokenValid，预留 5 分钟） */
export function isTokenValid(): boolean {
  const token = localStorage.getItem('token')
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return !!payload.exp && payload.exp > Date.now() / 1000 + 300
  } catch {
    return false
  }
}

interface ResourceEntry {
  id: string
  fileId: string
  pageName: string
  pageIndex: number
  md5: string
  resourceType: number
  ossImageUrl: string
  createTimeStamp: string
  updateTimeStamp: string
  toBeUploaded: boolean
  wasDeleted: boolean
}

/** 保存资源列表（复刻 saveResourceList） */
async function saveResourceList(resourceList: ResourceEntry[]): Promise<void> {
  const token = localStorage.getItem('token')
  const data = aesEncrypt(JSON.stringify(resourceList))
  const resp = await fetch(`${apiBase()}/CloudNotes/api/Resources/AddOrUpdate`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: data
  })
  const result = await resp.json()
  if (!resp.ok || result.code !== 0) throw new Error('保存资源失败: ' + JSON.stringify(result))
}

/** 保存笔记（复刻 saveNote） */
async function saveNote(
  userId: string,
  customFileId: string,
  fileName: string,
  fileUrl: string
): Promise<void> {
  const token = localStorage.getItem('token')
  const data = aesEncrypt(
    JSON.stringify({
      fileId: customFileId,
      fileName,
      parentId: '0',
      type: '12',
      fileUrl
    })
  )
  const resp = await fetch(`${apiBase()}/CloudNotes/api/Notes/AddOrUpdate`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: data
  })
  const result = await resp.json()
  if (!resp.ok || result.code !== 0) throw new Error('保存笔记失败: ' + JSON.stringify(result))
}

export interface UploadPdfOptions {
  file: File
  noteName: string
  /** 已转换好的图片（若已预先转换可传入，避免重复转换） */
  images?: PdfPageImage[]
  /** 本地旋转模式（默认不旋转）；取代原 autoLandscape 的自动竖版旋转行为。 */
  rotationMode?: RotationMode
  /** Stable ID for a batch item, reused on retry to avoid duplicate notes. */
  fileId?: string
  onProgress?: (percent: number, text: string) => void
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function replaceDigest(bytes: Uint8Array, digest: string, expected?: string): Blob {
  const text = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
  const matches = [...text.matchAll(expected ? new RegExp(expected, 'g') : /[0-9a-f]{64}/g)]
  if (matches.length !== 1) throw new Error('笔记模板中的资源摘要结构无效')
  const updated = bytes.slice()
  updated.set(new TextEncoder().encode(digest), matches[0].index)
  return new Blob([updated])
}

export async function preparePageTemplates(templates: Record<string, Blob>, image: Blob): Promise<Record<string, Blob>> {
  const result = { ...templates }
  const descriptor = `${TEMPLATE_UUID}/a2b4fb47-3623-45be-9fe9-57fc62e66651_file.bin`
  const router = `${TEMPLATE_UUID}/router.bin`
  result[descriptor] = replaceDigest(new Uint8Array(await templates[descriptor].arrayBuffer()), await sha256(image))
  result[router] = replaceDigest(new Uint8Array(await templates[router].arrayBuffer()), await sha256(result[descriptor]), await sha256(templates[descriptor]))
  return result
}

/** PDF 上传为云笔记主流程（复刻 uploadPdfAsNote） */
export async function uploadPdfAsNote(opts: UploadPdfOptions): Promise<PdfPageImage[]> {
  const { file, noteName, onProgress } = opts
  let lastProgress = 0
  const report = (p: number, t: string) => {
    lastProgress = Math.max(lastProgress, p)
    onProgress?.(lastProgress, t)
  }

  if (!isTokenValid()) throw new Error('登录已过期，请重新登录')
  const sessionBase = apiBase(), sessionUser = getUserIdFromToken()
  const assertSession = () => {
    if (!sessionUser || apiBase() !== sessionBase || getUserIdFromToken() !== sessionUser) throw new Error('账号或学校已切换，已停止笔记上传')
  }
  let uploadSource = file
  if (!opts.images?.length && opts.rotationMode && opts.rotationMode !== 'none') {
    report(1, '正在本地处理 PDF 页面方向...')
    const prepared = await prepareLandscapePdf(file, opts.rotationMode)
    uploadSource = prepared.file
    report(4, `已在本地按所选方向处理 ${prepared.rotatedPages.length} 页，准备上传`)
  }

  // 步骤1：加载模板文件
  report(5, '正在加载模板文件...')
  const templates = await loadTemplateFiles()

  const userId = getUserIdFromToken()
  assertSession()
  if (!userId) throw new Error('无法从登录信息获取用户 ID')
  const customFileId = opts.fileId || generateCustomFileId()
  if (!/^[a-z0-9]{33}$/.test(customFileId) || !/[g-z]/.test(customFileId.slice(1))) throw new Error('笔记文件 ID 无效')
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hour12: false
  }).replace(/\//g, '-')
  const resourceList: ResourceEntry[] = []
  const previewPages: PdfPageImage[] = []
  let noteRoot = ''
  let pageIndex = 0

  const uploadOnePage = async (img: PdfPageImage, total: number) => {
    if (img.blob.type !== 'image/webp') throw new Error('笔记图片必须为 WebP 格式')
    const pageHash = generatePageHash()
    const pageBase = '/storage/emulated/0/Android/data/com.friday.cloudsnote/userNote/' + userId + '/note/' + customFileId + '/' + pageHash
    const pageTemplates = await preparePageTemplates(templates, img.blob)
    const resources = [...TEMPLATE_FILES.map(rel => ({ rel, blob: pageTemplates[rel], type: rel.endsWith('.png') ? 2 : 1 })),
      { rel: 'res/image/' + IMG_FILENAME, blob: img.blob, type: 0 }]
    for (const [fileIndex, resource] of resources.entries()) {
      assertSession()
      const remoteName = resource.type === 0 ? IMG_FILENAME : resource.rel
      const uploadedUrl = await uploadFile(resource.blob, userId, 'note_v2', customFileId, pageHash + '/' + remoteName)
      if (!noteRoot) {
        const parsed = new URL(uploadedUrl)
        const suffix = pageHash + '/' + remoteName
        if (!parsed.pathname.endsWith(suffix)) throw new Error('上传返回的资源路径无法解析')
        noteRoot = parsed.origin + parsed.pathname.slice(0, -suffix.length)
      }
      resourceList.push({
        id: pageBase + '/' + resource.rel, fileId: customFileId, pageName: pageBase, pageIndex,
        md5: await blobToMd5(resource.blob), resourceType: resource.type, ossImageUrl: uploadedUrl,
        createTimeStamp: timestamp, updateTimeStamp: timestamp, toBeUploaded: false, wasDeleted: false
      })
      report(15 + ((pageIndex + (fileIndex + 1) / resources.length) / total) * 75,
        '上传第 ' + (pageIndex + 1) + '/' + total + ' 页 · 资源 ' + (fileIndex + 1) + '/' + resources.length)
    }
    if (!isPlus || pageIndex < 5) previewPages.push(img)
    pageIndex++
  }

  if (opts.images?.length) {
    for (const img of opts.images) await uploadOnePage(img, opts.images.length)
  } else {
    report(15, '正在本地渲染并上传 PDF...')
    await convertPdfToImages(uploadSource, undefined, {
      type: 'image/webp', quality: 0.96,
      canvasSize: NOTE_CANVAS,
      onPage: (img, _index, total) => uploadOnePage(img, total)
    })
  }
  if (!noteRoot || !pageIndex) throw new Error('PDF 中没有可上传的页面')

  // 步骤5、6：保存资源与笔记
  report(92, '正在保存资源...')
  assertSession()
  await saveResourceList(resourceList)

  report(97, '正在保存笔记...')
  assertSession()
  await saveNote(userId, customFileId, noteName, noteRoot)

  report(100, '上传完成！')
  return previewPages
}

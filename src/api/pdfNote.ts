/**
 * PDF 上传云笔记（1:1 复刻 pdf-upload.js 的 uploadPdfAsNote 主流程）
 *
 * 流程：加载模板 bin -> PDF 转图 -> 上传模板到 OSS -> 逐页上传图片并构建
 * resourceList（每页 9 条固定结构）-> Resources/AddOrUpdate -> Notes/AddOrUpdate
 */
import { aesEncrypt } from '@/utils/crypto'
import { uploadFile } from '@/utils/oss'
import { convertPdfToImages, type PdfPageImage } from '@/utils/pdf'
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

/** 每页固定的 8 条模板资源（相对路径 + 固定 md5 + resourceType） */
const TEMPLATE_RESOURCES: Array<{ rel: string; md5: string; resourceType: number }> = [
  { rel: 'page_router.bin', md5: 'C6FFAEB070ADBEC6B886BE63587CB0F8', resourceType: 1 },
  {
    rel: `${TEMPLATE_UUID}/059848e4-1971-47fb-9e47-517266cdef05_matrix.bin`,
    md5: '5D03C5A75809ED20D24C18388BB8AB63',
    resourceType: 1
  },
  {
    rel: `${TEMPLATE_UUID}/a2b4fb47-3623-45be-9fe9-57fc62e66651_file.bin`,
    md5: '5924B6262213683E6A4A2AFD3E4A270B',
    resourceType: 1
  },
  {
    rel: `${TEMPLATE_UUID}/e339e39b-64d9-4de0-bfaa-dace2a3f8e7d_command.bin`,
    md5: 'FEC4C90827E797E54126BB996BF0AF05',
    resourceType: 1
  },
  { rel: `${TEMPLATE_UUID}/header.bin`, md5: 'A929A287A521818CA4E56A9E643866AE', resourceType: 1 },
  { rel: `${TEMPLATE_UUID}/router.bin`, md5: '053971527BD9F3D4E3F9B2A1A4D2023F', resourceType: 1 },
  {
    rel: `${TEMPLATE_UUID}/screenshot.png`,
    md5: '538BC7AC54289E9EAA758C50A006AE59',
    resourceType: 2
  },
  { rel: `${TEMPLATE_UUID}/snapshot.bin`, md5: '9A26C2CA8A7C8731602497EA578C994F', resourceType: 1 }
]

/** 图片资源的固定 md5（复刻 core.py） */
const IMG_MD5 = '4126E637D965204140D4982A1B847283'

let templateFilesCache: Record<string, Blob> | null = null

function apiBase(): string {
  return localStorage.getItem('apiBaseUrl') || 'https://zyapi.loshop.com.cn'
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
function generatePageHash(): string {
  return String(Date.now() + Math.floor(Math.random() * 1000))
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
  if (result.code !== 0) throw new Error('保存资源失败: ' + JSON.stringify(result))
}

/** 保存笔记（复刻 saveNote） */
async function saveNote(
  userId: string,
  customFileId: string,
  fileName: string,
  todayStr: string
): Promise<void> {
  const token = localStorage.getItem('token')
  const fileUrl = `http://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/note_v2/res/${userId}/${todayStr}/${customFileId}/`
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
  if (result.code !== 0) throw new Error('保存笔记失败: ' + JSON.stringify(result))
}

export interface UploadPdfOptions {
  file: File
  noteName: string
  /** 已转换好的图片（若已预先转换可传入，避免重复转换） */
  images?: PdfPageImage[]
  onProgress?: (percent: number, text: string) => void
}

/** PDF 上传为云笔记主流程（复刻 uploadPdfAsNote） */
export async function uploadPdfAsNote(opts: UploadPdfOptions): Promise<PdfPageImage[]> {
  const { file, noteName, onProgress } = opts
  const report = (p: number, t: string) => onProgress?.(p, t)

  if (!isTokenValid()) throw new Error('登录已过期，请重新登录')

  // 步骤1：加载模板文件
  report(5, '正在加载模板文件...')
  const templates = await loadTemplateFiles()

  // 提前算好上传所需的标识与时间戳（流式逐页上传会用到）
  const userId = getUserIdFromToken()
  const customFileId = generateCustomFileId()
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const timestamp = new Date()
    .toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    .replace(/\//g, '-')
  const ossPageHash = generatePageHash()

  // 步骤3：上传模板文件到 OSS（先于转换，拿到 ossRoot）
  report(12, '正在上传模板文件...')
  const testFileUrl = await uploadFile(
    templates['page_router.bin'],
    userId,
    'note_v2',
    customFileId,
    ossPageHash + '/page_router.bin'
  )
  const urlObj = new URL(testFileUrl)
  const ossRoot = urlObj.protocol + '//' + urlObj.host + '/'
  delete templates['page_router.bin']
  for (const f of Object.keys(templates)) {
    if (f.includes('/')) {
      await uploadFile(templates[f], userId, 'note_v2', customFileId, ossPageHash + '/' + f)
    }
  }

  const ossBase = `${ossRoot}note_v2/res/${userId}/${todayStr}/${customFileId}`
  const baseOss = `${ossBase}/${ossPageHash}`
  const resourceList: ResourceEntry[] = []
  // plus 端内存受限：仅保留前 5 页用于预览/打包；桌面端保留全部
  const keepAll = !isPlus
  const previewPages: PdfPageImage[] = []
  let pageIndex = 0

  // 单页：上传图片到 OSS 并构建该页的 resourceList 条目（不持有 blob 之外的额外内存）
  const uploadOnePage = async (img: PdfPageImage) => {
    const pageHash = generatePageHash()
    const pageBase = `/storage/emulated/0/Android/data/com.friday.cloudsnote/userNote/${userId}/note/${customFileId}/${pageHash}`
    await uploadFile(img.blob, userId, 'note_v2', customFileId, `${pageHash}/${IMG_FILENAME}`)
    for (const tpl of TEMPLATE_RESOURCES) {
      resourceList.push({
        id: `${pageBase}/${tpl.rel}`,
        fileId: customFileId,
        pageName: pageBase,
        pageIndex,
        md5: tpl.md5,
        resourceType: tpl.resourceType,
        ossImageUrl: `${baseOss}/${tpl.rel}`,
        createTimeStamp: timestamp,
        updateTimeStamp: timestamp,
        toBeUploaded: false,
        wasDeleted: false
      })
    }
    resourceList.push({
      id: `${pageBase}/res/image/${IMG_FILENAME}`,
      fileId: customFileId,
      pageName: pageBase,
      pageIndex,
      md5: IMG_MD5,
      resourceType: pageIndex,
      ossImageUrl: `${ossBase}/${pageHash}/${IMG_FILENAME}`,
      createTimeStamp: timestamp,
      updateTimeStamp: timestamp,
      toBeUploaded: false,
      wasDeleted: false
    })
  }

  // 步骤2+4：转换并「逐页上传」（流式：边转边传、用完即弃，避免多页 Blob 同时占满内存 -> 白屏崩溃）
  report(15, '正在转换PDF...')
  if (opts.images && opts.images.length) {
    for (const img of opts.images) {
      await uploadOnePage(img)
      if (keepAll || pageIndex < 5) previewPages.push(img)
      report(65 + ((pageIndex + 1) / opts.images.length) * 25, `已上传第 ${pageIndex + 1}/${opts.images.length} 页`)
      pageIndex++
    }
  } else {
    await convertPdfToImages(
      file,
      (p, c, t) => report(15 + p * 30, `转换PDF：第 ${c}/${t} 页`),
      {
        onPage: async (img, _idx, total) => {
          await uploadOnePage(img)
          if (keepAll || pageIndex < 5) previewPages.push(img)
          report(65 + ((pageIndex + 1) / total) * 25, `已上传第 ${pageIndex + 1}/${total} 页`)
          pageIndex++
        }
      }
    )
  }

  // 步骤5、6：保存资源与笔记
  report(92, '正在保存资源...')
  await saveResourceList(resourceList)

  report(97, '正在保存笔记...')
  await saveNote(userId, customFileId, noteName, todayStr)

  report(100, '上传完成！')
  return previewPages
}

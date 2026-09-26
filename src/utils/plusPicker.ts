import { PLATFORM } from '@/config'
import { formatError, logError } from '@/utils/errorText'
import {
  hasAndroid,
  pickContentUris,
  uriToArrayBuffer,
  getUriDisplayName,
  getUriMime,
  extToMime
} from '@/utils/androidIntent'

/** 是否处于 HBuilder 5+ 环境 */
export const isPlus = PLATFORM === 'plus'

function getPlus(): any {
  return (window as any).plus
}

/** 等待 5+ ready（window.plus 在 plusready 后才存在） */
function waitPlusReady(): Promise<any> {
  return new Promise((resolve) => {
    const w = window as any
    if (w.plus) return resolve(w.plus)
    document.addEventListener('plusready', () => resolve(w.plus), false)
  })
}

/** 把 accept（扩展名或 MIME）转成 Android 意图 MIME */
function toAndroidMime(accept: string): string {
  return extToMime(accept)
}

/** MIME -> 扩展名（缺扩展名时补后缀用） */
function mimeToExt(m: string): string {
  if (m === 'application/pdf') return 'pdf'
  if (m === 'application/zip') return 'zip'
  if (m.startsWith('image/')) return m.split('/')[1] || 'jpg'
  if (m === 'text/plain') return 'txt'
  if (m === 'application/msword') return 'doc'
  if (m.includes('excel') || m.includes('spreadsheet')) return 'xlsx'
  return 'bin'
}

/**
 * 调取系统图片选择框（5+ 下用 plus.gallery.pick，走系统相册；
 * 非 5+ 环境回退到 <input type="file" accept="image/*">）。
 * @returns 标准 File 列表（已读取为可上传的 Blob）
 */
export async function pickImages(opts: { multiple?: boolean; maximum?: number } = {}): Promise<File[]> {
  if (!isPlus) return pickByInput('image/*', !!opts.multiple)
  await waitPlusReady()
  // 5+ 下 plus.gallery.pick 在部分设备/版本直接报 "Coding error"，
  // 改用系统意图 ACTION_GET_CONTENT(image/*) 调出系统图片选择器，更稳且符合需求。
  if (!hasAndroid()) return pickByInput('image/*', !!opts.multiple)
  const uris = await pickContentUris('image/*', !!opts.multiple)
  return Promise.all(uris.map(uriToFile))
}

/**
 * 调取系统文件选择框（任意文件）。
 * - 5+ Android：发 ACTION_GET_CONTENT 意图，真正调出系统文件管理器（不再是「相机」）。
 * - 其它环境（浏览器 / iOS）：回退到原生 <input type="file">。
 */
export async function pickFiles(accept: string, multiple = false): Promise<File[]> {
  if (!isPlus) return pickByInput(accept, multiple)
  await waitPlusReady()
  if (!hasAndroid()) return pickByInput(accept, multiple)
  const mime = toAndroidMime(accept)
  const uris = await pickContentUris(mime, multiple)
  return Promise.all(uris.map(uriToFile))
}

function pickByInput(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.display = 'none'
    document.body.appendChild(input)
    const cleanup = () => input.remove()
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      cleanup()
      resolve(files)
    }
    input.click()
  })
}

/** 将 5+ 本地文件路径读为标准 File（供 OSS 直传等使用） */
async function pathToFile(p: string): Promise<File> {
  const plus = getPlus()
  const entry: any = await new Promise((res, rej) =>
    plus.io.resolveLocalFileSystemURL(p, res, rej))
  const file: any = await new Promise((res, rej) => entry.file(res, rej))
  const ab: ArrayBuffer = await new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onloadend = () => res(reader.result as ArrayBuffer)
    reader.onerror = () => rej(new Error('读取文件失败'))
    reader.readAsArrayBuffer(file)
  })
  const name = file.name || p.split('/').pop() || 'image'
  const type = file.type || 'application/octet-stream'
  return new File([ab], name, { type })
}

/** 将系统选中的 content:// URI 读为标准 File（按显示名推断类型，缺扩展名则按 MIME 补） */
async function uriToFile(uriString: string): Promise<File> {
  const ab = await uriToArrayBuffer(uriString)
  let name = getUriDisplayName(uriString)
  if (!name) {
    // 退化：取 URI 末段
    const seg = decodeURIComponent(uriString.split('/').pop() || '')
    name = seg || 'file'
  }
  if (!/\.[a-z0-9]+$/i.test(name)) {
    const mime = getUriMime(uriString) || 'application/octet-stream'
    name = name + '.' + mimeToExt(mime)
  }
  const type = extToMime(name)
  return new File([ab], name, { type: type === '*/*' ? 'application/octet-stream' : type })
}

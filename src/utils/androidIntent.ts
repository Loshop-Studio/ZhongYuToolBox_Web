import { logError } from '@/utils/errorText'

/**
 * 5+（HBuilder）Android 下，<input type="file"> 运行时只支持图片/视频，
 * 选 PDF / 文档会退化成「相机」。要真正调出系统文件选择框 / 保存对话框，
 * 必须通过 plus.android 发送系统意图：
 *   - ACTION_GET_CONTENT    => 系统「打开/选择文件」框（带 OPENABLE 过滤）
 *   - ACTION_CREATE_DOCUMENT => 系统「另存为」框（用户选目标 + 文件名）
 * 并通过 onActivityResult 拿回 content:// URI，再用 ContentResolver 读写字节。
 *
 * 本模块只在 5+ Android 下被调用；非 Android / 非 5+ 环境由调用方回退到 <input>。
 */

export function hasAndroid(): boolean {
  const plus = (window as any).plus
  return !!(plus && plus.android)
}

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg'
}

/** 把 accept（扩展名或 MIME）统一成 Android 意图能用的 MIME；无法识别则给通配 */
export function extToMime(nameOrAccept: string): string {
  if (!nameOrAccept) return '*/*'
  if (/^[a-z*+-]+\/[a-z*+-]+$/i.test(nameOrAccept)) return nameOrAccept
  if (nameOrAccept[0] === '.') return MIME_MAP[nameOrAccept.toLowerCase()] || '*/*'
  // 形如 image/* 但带通配，原样返回
  return nameOrAccept.includes('/') ? nameOrAccept : '*/*'
}

function getMain(): any {
  const plus = (window as any).plus
  return plus.android.runtimeMainActivity()
}

/** 取得 ContentResolver（重载方法需经 invoke 调用，不能直接属性访问） */
function getCr(): any {
  const plus = (window as any).plus
  return plus.android.invoke(getMain(), 'getContentResolver')
}

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3'
}

function mimeToExt(mime: string): string {
  return EXT_BY_MIME[mime] || 'bin'
}

function hasExt(name: string): boolean {
  return /\.[a-z0-9]+$/i.test(name)
}

function resultOk(): number {
  const main = getMain()
  return main.RESULT_OK !== undefined ? main.RESULT_OK : -1
}

/**
 * 启动一个带返回结果的系统意图，返回 Promise<{ resultCode, data }>。
 * 兼容处理 onActivityResult：临时替换并保留/恢复原 handler，避免影响其它逻辑。
 */
function startActivityForResult(intent: any, code: number): Promise<{ resultCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const plus = (window as any).plus
    const main = getMain()
    const prev = main.onActivityResult
    let done = false
    // 防止 onActivityResult 未触发导致 Promise 永久挂起（如部分 ROM 不回调）
    const timer = setTimeout(() => {
      if (done) return
      done = true
      main.onActivityResult = prev
      logError('startActivityForResult', `操作超时（code=${code}），未收到系统返回`)
      reject(new Error('操作超时，请重试'))
    }, 60000)
    main.onActivityResult = (rc: number, res: number, data: any) => {
      if (rc === code) {
        if (done) return
        done = true
        clearTimeout(timer)
        main.onActivityResult = prev
        resolve({ resultCode: res, data })
        return
      }
      if (typeof prev === 'function') prev(rc, res, data)
    }
    try {
      plus.android.invoke(main, 'startActivityForResult', intent, code)
    } catch (e: any) {
      if (!done) {
        done = true
        clearTimeout(timer)
      }
      main.onActivityResult = prev
      logError('startActivityForResult', e)
      reject(e)
    }
  })
}

/** 调出系统文件选择框，返回选中的 content:// URI 列表 */
export async function pickContentUris(mime: string, multiple: boolean): Promise<string[]> {
  const plus = (window as any).plus
  if (!plus?.android) throw new Error('当前环境不支持系统文件选择')
  const Intent = plus.android.importClass('android.content.Intent')
  const intent = new Intent(Intent.ACTION_GET_CONTENT)
  intent.addCategory(Intent.CATEGORY_OPENABLE)
  intent.setType(mime || '*/*')
  if (multiple) plus.android.invoke(intent, 'putExtra', Intent.EXTRA_ALLOW_MULTIPLE, true)

  const { resultCode, data } = await startActivityForResult(intent, 9001)
  if (resultCode !== resultOk() || !data) return []

  const uris: string[] = []
  const clip = plus.android.invoke(data, 'getClipData')
  if (multiple && clip) {
    const n = plus.android.invoke(clip, 'getItemCount')
    for (let i = 0; i < n; i++) {
      const item = plus.android.invoke(clip, 'getItemAt', i)
      const u = plus.android.invoke(item, 'getUri')
      if (u) uris.push(plus.android.invoke(u, 'toString'))
    }
  } else {
    const u = plus.android.invoke(data, 'getData')
    if (u) uris.push(plus.android.invoke(u, 'toString'))
  }
  return uris
}

/** 调出系统「另存为」对话框，返回用户选定的目标 content:// URI */
export async function createDocumentUri(mime: string, filename: string): Promise<string> {
  const plus = (window as any).plus
  if (!plus?.android) throw new Error('当前环境不支持系统保存')
  const Intent = plus.android.importClass('android.content.Intent')
  const intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
  intent.addCategory(Intent.CATEGORY_OPENABLE)
  intent.setType(mime || 'application/octet-stream')
  plus.android.invoke(intent, 'putExtra', Intent.EXTRA_TITLE, filename)

  const { resultCode, data } = await startActivityForResult(intent, 9002)
  if (resultCode !== resultOk() || !data) throw new Error('已取消保存')
  const u = plus.android.invoke(data, 'getData')
  if (!u) throw new Error('未获取到保存路径')
  return plus.android.invoke(u, 'toString')
}

/** 读取 content:// URI 的字节为 ArrayBuffer（用于把系统选中的文件转成可上传的 File） */
export async function uriToArrayBuffer(uriString: string): Promise<ArrayBuffer> {
  const plus = (window as any).plus
  const Uri = plus.android.importClass('android.net.Uri')
  const uri = Uri.parse(uriString)
  const cr = getCr()
  const inputStream = plus.android.invoke(cr, 'openInputStream', uri)
  try {
    const ByteArrayOutputStream = plus.android.importClass('java.io.ByteArrayOutputStream')
    const bos = new ByteArrayOutputStream()
    const Byte = plus.android.importClass('java.lang.Byte')
    const buf = plus.android.invoke('java.lang.reflect.Array', 'newInstance', Byte.TYPE, 65536)
    let len = plus.android.invoke(inputStream, 'read', buf)
    while (len !== -1) {
      plus.android.invoke(bos, 'write', buf, 0, len)
      len = plus.android.invoke(inputStream, 'read', buf)
    }
    const bytes = plus.android.invoke(bos, 'toByteArray')
    const size = bytes.length
    const arr = new Uint8Array(size)
    for (let i = 0; i < size; i++) arr[i] = bytes[i] & 0xff
    return arr.buffer
  } finally {
    plus.android.invoke(inputStream, 'close')
  }
}

/** 把 ArrayBuffer 写入 content:// URI（用于系统「另存为」后落盘） */
export async function writeArrayBufferToUri(uriString: string, ab: ArrayBuffer): Promise<void> {
  const plus = (window as any).plus
  const Uri = plus.android.importClass('android.net.Uri')
  const uri = Uri.parse(uriString)
  const cr = getCr()
  const out = plus.android.invoke(cr, 'openOutputStream', uri)
  try {
    const src = new Uint8Array(ab)
    const Byte = plus.android.importClass('java.lang.Byte')
    const buf = plus.android.invoke('java.lang.reflect.Array', 'newInstance', Byte.TYPE, src.length)
    for (let i = 0; i < src.length; i++) buf[i] = src[i]
    plus.android.invoke(out, 'write', buf, 0, src.length)
    plus.android.invoke(out, 'flush')
  } finally {
    plus.android.invoke(out, 'close')
  }
}

/** 从 content:// URI 取系统显示名（作为文件名） */
export function getUriDisplayName(uriString: string): string {
  const plus = (window as any).plus
  try {
    const Uri = plus.android.importClass('android.net.Uri')
    const uri = Uri.parse(uriString)
    const cr = getCr()
    const cursor = plus.android.invoke(cr, 'query', uri, null, null, null, null)
    if (cursor) {
      try {
        if (plus.android.invoke(cursor, 'moveToFirst')) {
          const idx = plus.android.invoke(cursor, 'getColumnIndex', '_display_name')
          if (idx >= 0) {
            const name = plus.android.invoke(cursor, 'getString', idx)
            if (name) return String(name)
          }
        }
      } finally {
        plus.android.invoke(cursor, 'close')
      }
    }
  } catch (e: any) {
    logError('getUriDisplayName', e)
  }
  return ''
}

/** 从 content:// URI 取真实 MIME（_display_name 缺扩展名时用来补后缀） */
export function getUriMime(uriString: string): string {
  const plus = (window as any).plus
  try {
    const Uri = plus.android.importClass('android.net.Uri')
    const uri = Uri.parse(uriString)
    const cr = getCr()
    const t = plus.android.invoke(cr, 'getType', uri)
    if (t) return String(t)
  } catch (e: any) {
    logError('getUriMime', e)
  }
  return ''
}

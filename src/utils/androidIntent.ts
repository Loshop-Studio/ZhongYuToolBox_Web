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
    // 关键修复：不在 JS 里逐字节经 bridge 拷回（大文件会卡死/崩溃 -> 白屏）。
    // 改为 Java 侧直接 base64 编码，回传字符串后「直接解码成 Uint8Array」，
    // 不经过 atob 的等大同尺寸二进制字符串，内存峰值从 ~3.3 倍降到 ~2.3 倍。
    // flag=2 即 android.util.Base64.NO_WRAP，避免换行导致解码失败。
    const b64 = plus.android.invoke('android.util.Base64', 'encodeToString', bytes, 2)
    return base64ToArrayBuffer(b64).buffer as ArrayBuffer
  } finally {
    plus.android.invoke(inputStream, 'close')
  }
}

/**
 * 把 content:// URI 以「原生 Java IO」拷贝到 5+ 本地文件（_doc 绝对路径）。
 * 关键：整段拷贝发生在 Java 侧，不把字节经 bridge 变成 JS 字符串，也不在 JS 里跑
 * 解码循环——因此大 PDF 不会卡死主线程（复刻前 uriToArrayBuffer 的 base64+JS 解码是卡死根因）。
 * 拷贝完成后由调用方用 plus.io 原生 FileReader 读成 File，同样不走反射 base64。
 */
export async function copyUriToLocalFile(uriString: string, localAbsPath: string): Promise<void> {
  const plus = (window as any).plus
  const Uri = plus.android.importClass('android.net.Uri')
  const uri = Uri.parse(uriString)
  const cr = getCr()
  const inputStream = plus.android.invoke(cr, 'openInputStream', uri)
  let fos: any = null
  try {
    const FileOutputStream = plus.android.importClass('java.io.FileOutputStream')
    fos = new FileOutputStream(localAbsPath)
    const Byte = plus.android.importClass('java.lang.Byte')
    const buf = plus.android.invoke('java.lang.reflect.Array', 'newInstance', Byte.TYPE, 65536)
    let len = plus.android.invoke(inputStream, 'read', buf)
    while (len !== -1) {
      plus.android.invoke(fos, 'write', buf, 0, len)
      len = plus.android.invoke(inputStream, 'read', buf)
    }
  } finally {
    try {
      plus.android.invoke(inputStream, 'close')
    } catch {
      /* noop */
    }
    if (fos) {
      try {
        plus.android.invoke(fos, 'close')
      } catch {
        /* noop */
      }
    }
  }
}

/** 取 5+ _doc 的绝对路径（作为拷贝目标目录，位于应用私有存储内） */
export function getPrivateDocAbsPath(): Promise<string> {
  return new Promise((resolve, reject) => {
    const plus = (window as any).plus
    plus.io.resolveLocalFileSystemURL(
      '_doc/',
      (entry: any) => resolve(entry.fullPath as string),
      (e: any) => reject(e || new Error('获取 _doc 路径失败'))
    )
  })
}

/** 把 base64 字符串直接解码为 Uint8Array（不生成中间二进制字符串，省内存） */
function base64ToArrayBuffer(b64: string): Uint8Array {
  const len = b64.length
  const out = new Uint8Array((len * 3) >> 2)
  const A = 65, Z = 90, a = 97, z = 122, n0 = 48, plus2 = 43, slash = 47, pad = 61
  const code = (c: number): number => {
    if (c >= A && c <= Z) return c - A
    if (c >= a && c <= z) return c - a + 26
    if (c >= n0 && c <= n0 + 9) return c - n0 + 52
    if (c === plus2) return 62
    if (c === slash) return 63
    return 64 // padding / invalid
  }
  let o = 0
  for (let i = 0; i < len; i += 4) {
    const c0 = code(b64.charCodeAt(i))
    const c1 = code(b64.charCodeAt(i + 1))
    const c2 = code(b64.charCodeAt(i + 2))
    const c3 = code(b64.charCodeAt(i + 3))
    out[o++] = (c0 << 2) | (c1 >> 4)
    if (c2 !== 64) out[o++] = ((c1 & 15) << 4) | (c2 >> 2)
    if (c3 !== 64) out[o++] = ((c2 & 3) << 6) | c3
  }
  return out.subarray(0, o)
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

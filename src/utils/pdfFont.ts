/**
 * 高清 PDF 的中文矢量字体（HarmonyOS Sans SC Regular）。
 *
 * 只在真正需要时拉取一次并缓存；打包在 public/fonts 下，
 * 与 mistakePdf 一样需兼容 5+ 的 file:// 场景与子路径部署。
 * 字体不可用时调用方回退为位图文字，不影响导出成功。
 */
import type { jsPDF } from 'jspdf'
import { isPlus } from '@/utils/plusPicker'

const FONT_FILE = 'fonts/HarmonyOS_Sans_SC_Regular.ttf'
/** 注册进 jsPDF 后的字体名（setFont 时使用） */
export const CJK_PDF_FONT = 'HarmonyOSSC'
const FONT_VFS_NAME = 'HarmonyOSSC.ttf'

let pending: Promise<string | null> | undefined

/** 分块转 base64：一次性 String.fromCharCode 大字体（约 8MB）会爆栈 */
function toBase64(u8: Uint8Array): string {
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(bin)
}

/** 等待 5+ 环境就绪：plusready 之前 window.plus 不存在（与 saveFile 的取法一致） */
function waitPlusReady(timeout = 3000): Promise<any> {
  const w = window as any
  if (w.plus) return Promise.resolve(w.plus)
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      document.removeEventListener('plusready', done, false)
      resolve((window as any).plus)
    }
    const timer = setTimeout(done, timeout)
    document.addEventListener('plusready', done, false)
  })
}

/** 5+：从 _www 读取打包字体，返回 base64 */
function readFontByPlus(plus: any): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(
      '_www/' + FONT_FILE,
      (entry: any) => {
        entry.file(
          (file: any) => {
            // plus.io.File 不是标准 Blob，标准 FileReader 会报类型错误，必须用 plus.io.FileReader
            const reader = new plus.io.FileReader()
            reader.onloadend = () => {
              try {
                const dataUrl = String(reader.result || '')
                resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
              } catch (e) {
                reject(new Error('字体解码失败：' + (e as Error).message))
              }
            }
            reader.onerror = () => reject(new Error('字体读取失败'))
            reader.readAsDataURL(file)
          },
          (e: any) => reject(new Error('字体读取失败：' + (e?.message || e)))
        )
      },
      (e: any) => reject(new Error('字体定位失败：' + (e?.message || e)))
    )
  })
}

/** 读取字体 base64：5+ 走 plus.io（file:// 下 fetch 受限），其余走 fetch */
async function readFontBase64(): Promise<string> {
  if (isPlus) {
    const plus: any = await waitPlusReady()
    if (plus?.io) return readFontByPlus(plus)
  }
  const base = new URL(import.meta.env.BASE_URL || './', document.baseURI || location.href)
  const res = await fetch(new URL(FONT_FILE, base).href)
  if (!res.ok) throw new Error('字体请求失败 HTTP ' + res.status)
  return toBase64(new Uint8Array(await res.arrayBuffer()))
}

/**
 * 懒加载中文字体的 base64；失败返回 null（调用方回退位图文字）。
 * 失败不写缓存，便于 plus 未就绪、临时网络异常等情况下次导出重试。
 */
export function loadCjkFontBase64(): Promise<string | null> {
  return (pending ||= readFontBase64()
    .catch(() => null)
    .then((v) => {
      if (!v) pending = undefined
      return v
    }))
}

/**
 * 把中文字体注册进 jsPDF，返回 setFont 可用的字体名。
 * jsPDF 只嵌入实际用到的字形，一份多页 PDF 的中文字体开销通常仅几百 KB。
 */
export async function ensureCjkPdfFont(pdf: jsPDF): Promise<string | undefined> {
  const b64 = await loadCjkFontBase64()
  if (!b64) return undefined
  try {
    pdf.addFileToVFS(FONT_VFS_NAME, b64)
    pdf.addFont(FONT_VFS_NAME, CJK_PDF_FONT, 'normal')
    return CJK_PDF_FONT
  } catch {
    return undefined
  }
}

import { PLATFORM } from '@/config'
import { formatError, logError } from '@/utils/errorText'
import { createDocumentUri, writeArrayBufferToUri, extToMime } from '@/utils/androidIntent'

/**
 * 统一的「保存文件到本地」实现。
 * 不同平台落地方式不同：
 * - browser：blob URL + <a download>（浏览器自带保存对话框）
 * - plus：优先调系统「另存为」对话框（ACTION_CREATE_DOCUMENT，用户自选目录/文件名），
 *   系统保存不可用时回退到写入公共下载目录（PUBLIC_DOWNLOADS）
 * - electron：优先使用宿主通过 contextBridge 暴露的 window.electronAPI.saveFile，
 *   否则回退到渲染进程 fs（需开启 nodeIntegration）写入系统下载目录；
 *   若两者均不可用，再降级为浏览器 blob 方式。
 * 上层只需传入 Blob 与文件名，无需关心平台差异。
 */

export async function saveBlobFile(blob: Blob, filename: string): Promise<void> {
  // 文件名缺扩展名时按真实 MIME 补一个，避免保存出无后缀文件
  const safeName = ensureExtension(filename, blob)
  if (PLATFORM === 'plus') {
    const ab = await blobToArrayBuffer(blob)
    try {
      await saveBySystemDialog(ab, safeName)
    } catch (e: any) {
      // 用户主动取消：直接抛出，不再落盘
      if (/取消|cancel/i.test(e?.message || '')) throw e
      // 系统保存不可用（如无 android 环境）：回退到写入公共下载目录
      logError('saveBlobFile:dialog', e)
      await saveByPlus(ab, safeName)
    }
    return
  }
  if (PLATFORM === 'electron') {
    const ab = await blobToArrayBuffer(blob)
    await saveByElectron(ab, safeName)
    return
  }
  saveByBrowser(blob, safeName)
}

/**
 * Blob -> ArrayBuffer。
 * 注意：5+ 自带的老版本系统 WebView 中 Blob.arrayBuffer() 常返回空 ArrayBuffer，
 * 导致保存的文件 0 字节；改用 FileReader 读取，跨内核稳定。
 */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('读取文件内容失败'))
    reader.readAsArrayBuffer(blob)
  })
}

/** 文件名缺扩展名时，按 Blob 真实 MIME 补一个，避免保存出无后缀文件 */
const SAVE_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
}
function ensureExtension(filename: string, blob: Blob): string {
  if (/\.[a-z0-9]+$/i.test(filename)) return filename
  const mime = blob.type || ''
  const ext = SAVE_EXT[mime] || 'bin'
  return filename + '.' + ext
}

function saveByBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟释放，确保下载已触发
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 5+ 下调用系统「另存为」对话框（ACTION_CREATE_DOCUMENT） */
async function saveBySystemDialog(ab: ArrayBuffer, filename: string): Promise<void> {
  const mime = extToMime(filename)
  const uri = await createDocumentUri(mime, filename)
  await writeArrayBufferToUri(uri, ab)
}

function errMsg(e: any): string {
  return formatError(e)
}

/** 等待 5+ 环境就绪（window.plus 在 plusready 事件后才存在） */
function waitPlusReady(): Promise<any> {
  return new Promise((resolve) => {
    const w = window as any
    if (w.plus) return resolve(w.plus)
    document.addEventListener('plusready', () => resolve(w.plus), false)
  })
}

/** 5+ 回退方案：写入公共下载目录（PUBLIC_DOWNLOADS），无系统对话框 */
async function saveByPlus(ab: ArrayBuffer, filename: string): Promise<void> {
  const plus = await waitPlusReady()
  if (!plus || !plus.io) {
    // 5+ 不可用（如仍在浏览器调试），回退浏览器方式
    logError('saveByPlus', 'plus.io 不可用，回退浏览器下载')
    saveByBrowser(new Blob([ab]), filename)
    return
  }
  const blob = new Blob([ab])
  await new Promise<void>((resolve, reject) => {
    plus.io.requestFileSystem(
      plus.io.PUBLIC_DOWNLOADS,
      (fs: any) => {
        fs.root.getFile(
          filename,
          { create: true },
          (fileEntry: any) => {
            fileEntry.createWriter(
              (writer: any) => {
                writer.onwriteend = () => resolve()
                writer.onerror = (e: any) => {
                  const err = e?.target?.error || e
                  logError('saveByPlus', err)
                  reject(new Error('写入文件失败：' + errMsg(err)))
                }
                // 从起点写入，覆盖已存在文件的旧内容
                writer.seek(0)
                writer.write(blob)
              },
              (e: any) => {
                logError('saveByPlus', e)
                reject(new Error('创建写入器失败：' + errMsg(e)))
              }
            )
          },
          (e: any) => {
            logError('saveByPlus', e)
            reject(new Error('创建文件失败：' + errMsg(e)))
          }
        )
      },
      (e: any) => {
        logError('saveByPlus', e)
        reject(new Error('获取文件系统失败：' + errMsg(e)))
      }
    )
  })
}

async function saveByElectron(ab: ArrayBuffer, filename: string): Promise<void> {
  // 优先使用宿主桥接 API（推荐在主进程 contextBridge 暴露 saveFile）
  const bridge = (window as any).electronAPI
  if (bridge && typeof bridge.saveFile === 'function') {
    await bridge.saveFile(ab, filename)
    return
  }
  // 渲染进程开启 nodeIntegration 时，直接用 fs 写入系统下载目录
  try {
    const req = (window as any).require
    if (req) {
      const fs = req('fs')
      const path = req('path')
      const { app } = req('electron').remote
      const dir = app.getPath('downloads')
      fs.writeFileSync(path.join(dir, filename), Buffer.from(ab))
      return
    }
  } catch (e) {
    console.warn('[saveBlobFile] electron fs 写入失败，回退浏览器方式', e)
  }
  saveByBrowser(new Blob([ab]), filename)
}

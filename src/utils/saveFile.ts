import { PLATFORM, IS_WINDOWS } from '@/config'
import { formatError, logError } from '@/utils/errorText'

/**
 * 统一的「保存文件到本地」实现。
 * 不同平台落地方式不同：
 * - browser：blob URL + <a download>（浏览器自带保存对话框）
 * - plus（5+ 原生壳）：
 *   · Android：必须用 Native.js 调 SAF（ACTION_CREATE_DOCUMENT）弹系统保存对话框，
 *     让用户自选落盘位置。plus.io 在 Android 10+ 分区存储下禁止写公共 Download 目录
 *     （copyTo / 写 PUBLIC_DOWNLOADS 均报 code=10），故一律走 SAF。
 *   · 有可直接下载的网络 URL → 先用系统下载管理器 plus.downloader 拉到应用私有目录
 *     （系统级下载，可靠、不丢字节），再用 FileChannel.transferTo 把文件直接拷贝到
 *     SAF 选定的 Uri（字节全程留在 Java 侧，不走 JS 边界）。
 *   · 只有 Blob（如本地生成的 PDF/zip）→ 读成二进制串，用 OutputStreamWriter(ISO-8859-1)
 *     逐字节写进 SAF 选定的 Uri（同样避开 byte[] 与 plus.io FileWriter）。
 *   · iOS：无 SAF，写入应用沙盒 _documents（文件 App 可见）后 openFile 唤起打开/分享。
 * - electron：优先使用宿主通过 contextBridge 暴露的 window.electronAPI.saveFile，
 *   否则回退到渲染进程 fs（需开启 nodeIntegration）写入系统下载目录；
 *   若两者均不可用，再降级为浏览器 blob 方式。
 * 上层按需调用 saveBlobFile（传入 Blob）或 saveUrlFile（传入网络地址），无需关心平台差异。
 */

/**
 * 按 Blob 保存文件（无现成 URL 的场景）。
 * 5+ 下优先直传 OSS 拿到公开 URL，再走系统下载器（可靠、不丢字节）；
 * OSS 不可用（未登录/无网络等）时回退到直写 SAF 兜底。
 */
export async function saveBlobFile(blob: Blob, filename: string, options: { localOnly?: boolean } = {}): Promise<void> {
  // 空内容直接判失败，避免在各平台写出 0 字节文件（尤其 5+ 下难以察觉）
  if (!blob || blob.size === 0) {
    throw new Error('待保存的文件内容为空（0 字节），未写入')
  }
  // 文件名缺扩展名时按真实 MIME 补一个，避免保存出无后缀文件
  const safeName = ensureExtension(filename, blob)
  if (PLATFORM === 'plus') {
    if (options.localOnly) { await saveBlobOnPlus(blob, safeName); return }
    // 无现成 URL：先直传 OSS 拿公开地址，再交给系统下载器下载到本地并走 SAF 保存。
    try {
      const url = await uploadBlobToOss(blob, safeName)
      await saveByPlusDownloader(url, safeName)
      return
    } catch (e) {
      logError('saveBlobFile', 'OSS 上传失败，回退直写 SAF：' + formatError(e))
      await saveBlobOnPlus(blob, safeName)
      return
    }
  }
  if (IS_WINDOWS || PLATFORM === 'android' || PLATFORM === 'ios') {
    const ab = await blobToArrayBuffer(blob)
    await saveByElectron(ab, safeName)
    return
  }
  saveByBrowser(blob, safeName)
}

/**
 * 按网络地址保存文件（已有可下载 URL 的场景）。
 * 5+ 下直接走系统下载管理器，无需先 fetch 成 Blob，从根本上杜绝 0 字节问题。
 */
export async function saveUrlFile(url: string, filename: string): Promise<void> {
  if (!url) throw new Error('下载地址为空')
  if (PLATFORM === 'plus') {
    const safeName = ensureExtension(filename, undefined, url)
    await saveByPlusDownloader(url, safeName)
    return
  }
  // 非 plus：fetch 成 Blob 再走统一路径
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error('下载失败 HTTP ' + resp.status)
    const blob = await resp.blob()
    if (!blob || blob.size === 0) throw new Error('下载内容为空（0 字节）')
    await saveBlobFile(blob, filename)
  } catch (e: any) {
    throw new Error(e?.message || String(e))
  }
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

/** 文件名缺扩展名时的兜底扩展名 */
const SAVE_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
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

/** 从 URL pathname 末尾尝试提取扩展名 */
function extFromUrl(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').pop() || ''
    const m = seg.match(/\.([a-z0-9]+)$/i)
    return m ? m[1].toLowerCase() : ''
  } catch {
    return ''
  }
}

/**
 * 文件名缺扩展名时补一个：优先用 Blob 真实 MIME，其次用 URL 推导，都没有则 bin。
 */
function ensureExtension(filename: string, blob?: Blob, url?: string): string {
  if (/\.[a-z0-9]+$/i.test(filename)) return filename
  const mime = blob && blob.type ? blob.type : ''
  let ext = SAVE_EXT[mime] || ''
  if (!ext && url) ext = extFromUrl(url)
  if (!ext) ext = 'bin'
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

/** 等待 5+ 环境就绪（window.plus 在 plusready 事件后才存在） */
function waitPlusReady(): Promise<any> {
  return new Promise((resolve) => {
    const w = window as any
    if (w.plus) return resolve(w.plus)
    document.addEventListener('plusready', () => resolve(w.plus), false)
  })
}

/**
 * 把 Blob 直传到 OSS，返回可公开访问的 URL（供系统下载器二次下载）。
 * 仅在 5+ 且无现成 URL 时使用（如本地生成的 PDF/zip）。
 */
async function uploadBlobToOss(blob: Blob, filename: string): Promise<string> {
  const oss = await import('@/utils/oss')
  const userId = await oss.fetchUserId()
  return oss.uploadFile(blob, userId, 'note_v2', '', filename)
}

/**
 * 5+ 原生下载：调用系统下载管理器（plus.downloader）拉取网络资源到本地。
 * 文件落在应用下载目录（_downloads，前缀由 5+ 强制要求），与系统“下载”目录不同，
 * 但能规避 5+ FileWriter 偶发的 0 字节问题，并支持断点续传与通知栏进度。
 */
async function saveByPlusDownloader(url: string, filename: string): Promise<void> {
  const plus = await waitPlusReady()
  if (!plus || !plus.downloader) {
    // 5+ 不可用（如浏览器调试），回退浏览器方式
    logError('saveByPlusDownloader', 'plus.downloader 不可用，回退浏览器下载')
    const blob = await (await fetch(url)).blob()
    saveByBrowser(blob, filename)
    return
  }
  await new Promise<void>((resolve, reject) => {
    let dtask: any
    try {
      dtask = plus.downloader.createDownload(
        url,
        { filename: '_downloads/' + filename },
        (d: any, status: number) => {
          if (status === 200) {
            // 系统下载器把文件落到应用私有 _downloads（可靠、不丢字节）。
            // Android 10+ 分区存储禁止直接写公共 Download（code=10），故读回文件后
            // 走 SAF 弹系统保存对话框，让用户自选落盘位置。
            presentDownloaded(d.filename, filename)
              .then(() => resolve())
              .catch((e) => {
                logError('saveByPlusDownloader', '保存失败：' + formatError(e))
                reject(e)
              })
          } else {
            logError('saveByPlusDownloader', { url, status, savedFile: d?.filename })
            reject(new Error('下载失败 HTTP ' + status))
          }
        }
      )
    } catch (e) {
      reject(new Error('创建下载任务失败：' + formatError(e)))
      return
    }
    if (!dtask) {
      reject(new Error('创建下载任务失败：未返回任务对象'))
      return
    }
    dtask.start()
  })
}

/**
 * 系统下载器把文件落到了应用私有 _downloads；取其绝对路径后走 SAF 让用户自选落盘位置。
 * 注意：Java 的 byte[] 经 Native.js 边界返回给 JS 会变成 null（写盘会 NPE），
 * 故全程不搬运字节，改用 FileChannel.transferTo 在 Java 侧直接拷贝文件。
 */
async function presentDownloaded(srcPath: string, filename: string): Promise<void> {
  const absPath = await resolveAbsPath(srcPath)
  try {
    await launchSafDialog(filename, (os) => copyFileToStream(absPath, os))
  } finally {
    deletePlusFile(absPath)
  }
}

/** 5+ 虚拟路径（如 _downloads/xxx）→ 本地绝对路径 */
function resolveAbsPath(path: string): Promise<string> {
  const plus: any = (window as any).plus
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(
      path,
      (entry: any) => {
        try {
          resolve(toAbsPath(entry.toLocalURL()))
        } catch (e) {
          reject(new Error('获取本地路径失败：' + formatError(e)))
        }
      },
      (e: any) => reject(new Error('解析文件路径失败：' + formatError(e)))
    )
  })
}

/** file:///xxx → /xxx */
function toAbsPath(localUrl: any): string {
  return decodeURIComponent(String(localUrl || '').replace(/^file:\/\//, ''))
}

/** 尽力删除应用私有临时文件，失败不抛错 */
function deletePlusFile(absPath: string): Promise<void> {
  const plus: any = (window as any).plus
  if (!absPath) return Promise.resolve()
  return new Promise((resolve) => {
    plus.io.resolveLocalFileSystemURL(
      'file://' + absPath,
      (entry: any) => {
        try {
          entry.remove(
            () => resolve(),
            () => resolve()
          )
        } catch {
          resolve()
        }
      },
      () => resolve()
    )
  })
}

/**
 * 5+ 下保存 Blob 的统一入口：
 * - Android：Native.js 调 SAF（ACTION_CREATE_DOCUMENT）弹系统保存对话框，
 *   规避 Android 10+ 分区存储对公共 Download 目录的禁写（plus.io copyTo/写 PUBLIC_DOWNLOADS 会 code=10）。
 * - iOS：无 SAF，写应用沙盒 _documents（文件 App 可见）后 openFile 唤起打开/分享。
 * - 取不到 plus：回退浏览器 <a download>。
 */
async function saveBlobOnPlus(blob: Blob, filename: string): Promise<void> {
  const plus: any = await waitPlusReady()
  if (plus && plus.android && plus.android.runtimeMainActivity) {
    await saveBlobWithSystemDialog(blob, filename)
  } else if (plus && plus.io) {
    await saveBlobOnIOS(blob, filename)
  } else {
    saveByBrowser(blob, filename)
  }
}

/**
 * Android：把 Blob 内容不经临时文件、不经 byte[] 直接写进 SAF 选定的 Uri。
 * 思路：Blob → 二进制串（atob 得到的 Latin-1 串，每个字符即一个字节）→
 * 用 java.io.OutputStreamWriter(ISO-8859-1) 逐字符写成 1 字节。
 * 这样既绕开 5+ plus.io FileWriter（对 JS 生成的 Blob 可能不触发 onwriteend 而挂起），
 * 也绕开 Java byte[] 无法经 Native.js 边界返回 JS 的限制。
 */
async function saveBlobWithSystemDialog(blob: Blob, filename: string): Promise<string> {
  const bin = await blobToBinaryString(blob)
  return launchSafDialog(filename, (os) => copyBinaryStringToStream(bin, os))
}

/** Blob -> 二进制字符串（每个字符 charCode 为 0-255，对应一个字节） */
function blobToBinaryString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onloadend = () => {
      try {
        const dataUrl = String(fr.result || '')
        const b64 = dataUrl.split(',')[1] || ''
        resolve(atob(b64))
      } catch (e) {
        reject(new Error('读取文件内容失败：' + formatError(e)))
      }
    }
    fr.onerror = () => reject(new Error('读取文件内容失败'))
    fr.readAsDataURL(blob)
  })
}

/**
 * 把二进制串写进目标输出流：OutputStreamWriter 以 ISO-8859-1 编码，逐字符写 1 字节。
 * 分块写入，避免一次性构造超大 Java String。
 */
function copyBinaryStringToStream(bin: string, os: any): void {
  const plus: any = (window as any).plus
  const osw: any = plus.android.newObject('java.io.OutputStreamWriter', os, 'ISO-8859-1')
  const CHUNK = 1 << 20
  for (let i = 0; i < bin.length; i += CHUNK) {
    plus.android.invoke(osw, 'write', bin.slice(i, i + CHUNK))
  }
  plus.android.invoke(osw, 'flush')
}

/** SAF 对话框允许保存的类型（扩展名 -> MIME） */
const SAF_MIME: Record<string, string> = {
  zip: 'application/zip',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  bin: 'application/octet-stream'
}

/** 由文件名后缀推导 MIME（SAF 类型过滤用） */
function mimeFromFilename(filename: string): string {
  const ext = (String(filename).match(/\.([a-z0-9]+)$/i) || [])[1]
  return (ext && SAF_MIME[ext.toLowerCase()]) || 'application/octet-stream'
}

/**
 * Android：Native.js 调 SAF（ACTION_CREATE_DOCUMENT）弹系统保存对话框。
 * 拿到用户选定的 Uri 后，回调 writeTo 把内容写进其 OutputStream（全程 Java 侧，不搬运 byte[]）。
 * 必须在 plusready 之后调用；onActivityResult 只能有一个，这里会包裹旧回调避免冲突。
 */
function launchSafDialog(filename: string, writeTo: (os: any) => void): Promise<string> {
  const plus: any = (window as any).plus
  return new Promise<string>((resolve, reject) => {
    const main = plus.android.runtimeMainActivity()
    const Intent = plus.android.importClass('android.content.Intent')

    const intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
    intent.addCategory(Intent.CATEGORY_OPENABLE)
    intent.setType(mimeFromFilename(filename))
    intent.putExtra(Intent.EXTRA_TITLE, filename)

    const REQ_CODE = 0x5a01
    // 包裹原有 onActivityResult，避免覆盖其它功能（如系统文件选择）的回调
    const oldOnActivityResult = main.onActivityResult
    main.onActivityResult = function (
      this: any,
      requestCode: number,
      resultCode: number,
      data: any
    ) {
      if (requestCode !== REQ_CODE) {
        if (typeof oldOnActivityResult === 'function') {
          oldOnActivityResult.apply(main, arguments as any)
        }
        return
      }
      // 处理本次请求前先还原，避免多次保存时回调链无限堆叠
      main.onActivityResult = oldOnActivityResult
      try {
        if (resultCode === -1 /* Activity.RESULT_OK */ && data) {
          const uri = data.getData()
          const resolver = main.getContentResolver()
          // openOutputStream 是 Java 重载方法，Native.js 下必须用 plus.android.invoke
          const os = plus.android.invoke(resolver, 'openOutputStream', uri)
          if (!os) {
            reject(new Error('打开输出流失败'))
            return
          }
          try {
            writeTo(os)
            // 该 Java 对象的方法未以 JS 函数形式暴露，flush/close 必须用 plus.android.invoke
            plus.android.invoke(os, 'flush')
          } finally {
            try {
              plus.android.invoke(os, 'close')
            } catch {
              /* 忽略关闭异常 */
            }
          }
          resolve(uri.toString())
        } else {
          reject(new Error('用户取消保存'))
        }
      } catch (e) {
        reject(e)
      }
    }
    main.startActivityForResult(intent, REQ_CODE)
  })
}

/**
 * 用 java.nio FileChannel.transferTo 把本地文件拷到目标输出流，规避 byte[] 过 JS 边界。
 * 目标侧用 Channels.newChannel(OutputStream) 包一层，任何 OutputStream 都适用。
 */
function copyFileToStream(absPath: string, os: any): void {
  const plus: any = (window as any).plus
  const Channels = plus.android.importClass('java.nio.channels.Channels')
  const fis: any = plus.android.newObject('java.io.FileInputStream', absPath)
  try {
    const srcCh: any = plus.android.invoke(fis, 'getChannel')
    // Channels.newChannel 是静态方法，直接以类对象调用最可靠（invoke 实例方式可能返回 null）
    const dstCh: any = Channels.newChannel(os)
    if (!dstCh) throw new Error('创建输出通道失败')
    // 注意：FileInputStream.available() 只是“估计可读字节数”，部分 ROM 返回 0 或 MAX_VALUE，
    // 必须用 FileChannel.size() 取真实文件大小，否则会拷出 0 字节文件。
    const size = Number(plus.android.invoke(srcCh, 'size')) || 0
    let copied = 0
    while (copied < size) {
      const n = Number(plus.android.invoke(srcCh, 'transferTo', copied, size - copied, dstCh))
      if (!n || n <= 0) break
      copied += n
    }
    if (copied < size) throw new Error('文件拷贝不完整：' + copied + '/' + size)
  } finally {
    try {
      plus.android.invoke(fis, 'close')
    } catch {
      /* 忽略关闭异常 */
    }
  }
}

/**
 * iOS 兜底：5+ 无 SAF。写入应用沙盒 _documents（用户可在“文件”App 的 App 目录下看到），
 * 再 openFile 唤起系统打开/分享面板，由用户决定导出到何处。
 */
async function saveBlobOnIOS(blob: Blob, filename: string): Promise<void> {
  const plus: any = await waitPlusReady()
  const ab = await blobToArrayBuffer(blob)
  await new Promise<void>((resolve, reject) => {
    plus.io.requestFileSystem(
      plus.io.PRIVATE_DOC,
      (fs: any) => {
        fs.root.getFile(
          filename,
          { create: true },
          (fileEntry: any) => {
            fileEntry.createWriter(
              (writer: any) => {
                writer.onwriteend = () => {
                  // 写入完成后唤起打开/分享，便于用户导出
                  try {
                    plus.runtime.openFile(fileEntry.fullPath)
                  } catch {
                    /* 忽略：打开面板失败不影响文件已落盘 */
                  }
                  resolve()
                }
                writer.onerror = (e: any) =>
                  reject(new Error('写入文件失败：' + formatError(e)))
                writer.seek(0)
                writer.write(new Blob([ab]))
              },
              (e: any) => reject(new Error('创建写入器失败：' + formatError(e)))
            )
          },
          (e: any) => reject(new Error('创建文件失败：' + formatError(e)))
        )
      },
      (e: any) => reject(new Error('获取文件系统失败：' + formatError(e)))
    )
  })
}

async function saveByElectron(ab: ArrayBuffer, filename: string): Promise<void> {
  // 优先使用宿主桥接 API（推荐在主进程 contextBridge 暴露 saveFile）
  const bridge = (window as any).nativeHost || (window as any).electronAPI
  if (bridge && typeof bridge.saveFile === 'function') {
    const result = await bridge.saveFile(ab, filename)
    if (result?.canceled || result === false) throw new Error('已取消保存')
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

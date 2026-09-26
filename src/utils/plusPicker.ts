import { PLATFORM } from '@/config'
import { logError } from '@/utils/errorText'

/** 是否处于 HBuilder 5+ 环境 */
export const isPlus = PLATFORM === 'plus'

function getPlus(): any {
  return (window as any).plus
}

/**
 * 调取系统图片选择框（5+ 下用 plus.gallery.pick，走系统相册；
 * 非 5+ 环境回退到 <input type="file" accept="image/*">）。
 * @returns 标准 File 列表（已读取为可上传的 Blob）
 */
/** Promise 超时包装：避免系统回调/读取永不触发导致「卡住无报错」 */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

/**
 * 5+ 原生相册选择（最稳的图片选取方式，返回本地文件路径数组）。
 * 注意：不要传 system:true，部分 ROM 调起系统选择器后回调收不到（表现为「选完没反应」）。
 * 这里用 5+ 内置画廊，回调最可靠；并加超时，避免回调不触发导致永久 pending。
 * 失败（含超时）时 reject，由调用方回退到 <input type="file"> 选图。
 */
function galleryPickPaths(multiple: boolean, maximum: number): Promise<string[]> {
  return withTimeout(
    new Promise((resolve, reject) => {
      const plus = getPlus()
      if (!plus || !plus.gallery || typeof plus.gallery.pick !== 'function') {
        return reject(new Error('gallery.pick 不可用'))
      }
      plus.gallery.pick(
        (res: any) => {
          const arr = Array.isArray(res) ? res : [res]
          resolve(arr.filter((x: any) => typeof x === 'string' && x))
        },
        (err: any) => reject(err || new Error('选择图片已取消')),
        { filter: 'image', multiple, maximum: multiple ? maximum : 1 }
      )
    }),
    30000,
    '调起相册超时（未收到选择结果）'
  )
}

/**
 * 调取系统图片选择框（所有环境统一走 5+ WebView 原生 <input type="file" accept="image/*">）。
 * 由 WebView 的 onShowFileChooser 直接把选择结果包装成标准 File 返回，
 * 无需 gallery.pick 回调（部分 ROM 回调不触发 -> 之前「选完没反应」）或 ContentResolver
 * 反射读取（会卡死主线程 -> 之前「卡死」）。浏览器 / Electron 同样走此路径。
 * 仅当 input 拿不到文件（极少数环境）时，再回退到 5+ 原生相册。
 * @returns 标准 File 列表（已读取为可上传的 Blob）
 */
export async function pickImages(opts: { multiple?: boolean; maximum?: number } = {}): Promise<File[]> {
  const multiple = !!opts.multiple
  // 主路径：<input type="file"> 由 5+ WebView 原生接管，返回标准 File（不卡线程、不卡死）
  try {
    const files = await withTimeout(
      pickByInput('image/*', multiple),
      120000,
      '选择图片超时，请重试'
    )
    if (files.length) return files
  } catch (e: any) {
    logError('pickImages.input', e)
  }
  // 兜底：input 拿不到文件时，再尝试 5+ 原生相册（含超时，避免永久 pending）
  try {
    const paths = await galleryPickPaths(multiple, opts.maximum || 9)
    return await Promise.all(paths.map((p) => pathToFile(p)))
  } catch (e: any) {
    logError('pickImages.gallery', e)
    return []
  }
}

/**
 * 调系统文件选择框（任意文件 / 指定类型）。
 * 统一走 WebView 原生 <input type="file">：
 * - 5+ Android 的 WebView 会直接弹出系统文件选择器（DocumentsUI / SAF），
 *   选完 input.files[0] 即标准 File（继承自 Blob），图片/PDF/任意文件通用，无需 Native.js。
 * - iOS 同样支持（照片图库/浏览文件），跨平台一致。
 * @param accept accept 值，如图片通配、application/pdf、任意文件通配，或逗号组合
 */
export async function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return pickFileByInput(accept, multiple)
}

/**
 * <input type="file"> 选文件（带取消兜底）。
 * 取消选择没有标准事件，这里用 window focus + 延时判断 input.files 是否为空来兜底；
 * 取消时 resolve([])（与旧行为一致），避免调用方误报“选择失败”。
 */
function pickFileByInput(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    input.multiple = multiple
    // 离屏定位而非 display:none：部分 WebView 会拦截对隐藏 file 输入的 .click()
    input.style.position = 'fixed'
    input.style.top = '-1000px'
    input.style.left = '-1000px'
    input.style.opacity = '0'
    input.style.width = '1px'
    input.style.height = '1px'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)

    let settled = false
    const cleanup = () => {
      settled = true
      input.remove()
      window.removeEventListener('focus', onFocus)
    }
    const onFocus = () => {
      // 取消选择时不会触发 change，用 focus 回来兜底
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          cleanup()
          resolve([])
        }
      }, 800)
    }
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      cleanup()
      resolve(files)
    }
    window.addEventListener('focus', onFocus, false)
    // 用户手势内触发，5+ WebView 会调起系统选择器并通过 onchange 回传 File
    input.click()
  })
}

function pickByInput(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    // 离屏定位而非 display:none：部分 WebView 会拦截对隐藏 file 输入的 .click()
    input.style.position = 'fixed'
    input.style.top = '-1000px'
    input.style.left = '-1000px'
    input.style.opacity = '0'
    input.style.width = '1px'
    input.style.height = '1px'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)
    const cleanup = () => input.remove()
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      cleanup()
      resolve(files)
    }
    // 用户手势内触发，5+ WebView 会调起系统选择器并通过 onchange 回传 File
    input.click()
  })
}

/** 将 5+ 本地文件路径读为标准 File（供 OSS 直传等使用） */
async function pathToFile(p: string): Promise<File> {
  const plus = getPlus()
  const entry: any = await withTimeout(
    new Promise((res, rej) => plus.io.resolveLocalFileSystemURL(p, res, rej)),
    20000,
    '读取本地文件超时（resolveLocalFileSystemURL）'
  )
  const file: any = await withTimeout(
    new Promise((res, rej) => entry.file(res, rej)),
    20000,
    '读取本地文件超时（entry.file）'
  )
  const ab: ArrayBuffer = await withTimeout(
    new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onloadend = () => res(reader.result as ArrayBuffer)
      reader.onerror = () => rej(new Error('读取文件失败'))
      reader.readAsArrayBuffer(file)
    }),
    30000,
    '读取本地文件超时（FileReader）'
  )
  const name = file.name || p.split('/').pop() || 'image'
  const type = file.type || 'application/octet-stream'
  return new File([ab], name, { type })
}

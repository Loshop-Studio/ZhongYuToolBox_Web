/**
 * PDF 工具
 * - convertPdfToImages: 本地用 pdfjs-dist 把每页渲染成高清图片（不再依赖外部 pdf2img 接口）
 * - blobToMd5: 图片 MD5
 * - zipBlobs: 打包为 zip（用于下载）
 */
import CryptoJS from 'crypto-js'
import { loadPdfjs } from '@/utils/pdfWorker'
import JSZip from 'jszip'
import { fitPageToCanvas } from './noteCanvas'

export interface PdfPageImage {
  pageNum: number
  blob: Blob
  url: string
}

/** PDF 转图参数 */
export interface ConvertPdfOptions {
  /** 渲染倍率，越大越清晰、体积越大。默认 3（≈216 DPI，打印级清晰）；要更锐利可调 4~6 */
  scale?: number
  /** 输出格式，默认 image/png（无损）。可选 image/webp / image/jpeg（更小） */
  type?: 'image/png' | 'image/jpeg' | 'image/webp'
  /** 有损格式质量 0~1，默认 0.92 */
  quality?: number
  /** Preview only the first N pages; uploads omit this option. */
  maxPages?: number
  /** Entire visible PDF page fits inside this canvas, with white letterboxing. */
  canvasSize?: { width: number; height: number }
  /**
   * 逐页回调（流式）。提供后，每渲染完一页立即交付并「不再累积」到返回值，
   * 调用方可在回调里边转边传、用完即弃，避免多页 Blob 同时占满内存导致 WebView 崩溃。
   * 不提供则保持原行为：返回全部页（用于预览/打包下载）。
   */
  onPage?: (img: PdfPageImage, index: number, total: number) => Promise<void> | void
}

/** 计算 blob 的 MD5（大写） */
export async function blobToMd5(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const wordArray = CryptoJS.lib.WordArray.create(buffer as any)
  return CryptoJS.MD5(wordArray).toString().toUpperCase()
}

/**
 * PDF 转图片（本地渲染，不依赖任何外部接口，彻底规避 pdf2img 的跨域/CORS 问题）
 * 复用项目已有的 pdfjs-dist（与 LessonViewerView 同一套 worker 初始化），
 * 每页按 scale 倍率渲染到 canvas 并导出为高清图片。
 */
export async function convertPdfToImages(
  pdfFile: File,
  onProgress?: (percent: number, current: number, total: number) => void,
  opts: ConvertPdfOptions = {}
): Promise<PdfPageImage[]> {
  const scale = opts.scale ?? 3
  const type = opts.type ?? 'image/png'
  const quality = opts.quality ?? 0.92

  onProgress?.(0.05, 0, 1)

  // 动态引入 pdfjs-dist，并初始化 worker（与主视图一致的模块级单例）
  const pdfjs = await loadPdfjs()

  const data = await pdfFile.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  const total = opts.maxPages ? Math.min(doc.numPages, opts.maxPages) : doc.numPages
  // 仅在未提供 onPage 时才累积（用于预览/打包下载）；提供 onPage 则逐页交付、不占内存
  const images: PdfPageImage[] = opts.onPage ? [] : []

  try {
    for (let i = 1; i <= total; i++) {
      onProgress?.(((i - 1) / total) * 0.92, i, total)
      const page = await doc.getPage(i)
      const baseViewport = page.getViewport({ scale: 1 })
      const fit = opts.canvasSize ? fitPageToCanvas(baseViewport.width, baseViewport.height, opts.canvasSize) : null
      const viewport = page.getViewport({ scale: fit?.scale ?? scale })
      const canvas = document.createElement('canvas')
      canvas.width = opts.canvasSize?.width ?? Math.ceil(viewport.width)
      canvas.height = opts.canvasSize?.height ?? Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法创建画布上下文')
      // 白底填充，避免透明背景在笔记中显示异常
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // intent: 'print' 走打印级渲染管线，文字/矢量更锐利、避免灰边
      await page.render({ canvasContext: ctx, viewport, intent: 'print',
        transform: fit ? [1, 0, 0, 1, fit.x, fit.y] : undefined }).promise
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('第 ' + i + ' 页导出图片失败'))),
          type,
          quality
        )
      )
      if (blob.type !== type) throw new Error('当前环境无法导出所需图片格式：' + type)
      const img: PdfPageImage = { pageNum: i, blob, url: '' }
      if (opts.onPage) {
        // 流式：交付给调用方后立即释放，不被本数组持有（关键：避免多页同时占内存）
        await opts.onPage(img, i - 1, total)
      } else {
        images.push(img)
      }
      // 主动断开 canvas 引用，帮助 GC 尽快回收该页位图
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }
  onProgress?.(1, total, total)
  return images
}

/** 将多张图片打包为 zip 下载 */
export async function zipBlobs(
  files: Array<{ name: string; blob: Blob }>
): Promise<Blob> {
  const zip = new JSZip()
  for (const f of files) {
    zip.file(f.name, f.blob)
  }
  return await zip.generateAsync({ type: 'blob' })
}

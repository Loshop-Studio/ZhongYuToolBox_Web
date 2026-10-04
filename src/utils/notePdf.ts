import { jsPDF } from 'jspdf'
import { ensureCjkPdfFont } from './pdfFont'
import { drawSvgToPdf } from './svgToPdf'
import { resourceFetchUrl } from './proxy'

export function loadNoteImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const finish = (error?: Error) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
      image.onload = image.onerror = null
      if (error) { image.src = ''; reject(error) } else resolve(image)
    }
    const abort = () => finish(new DOMException('笔记任务已取消', 'AbortError'))
    const timer = setTimeout(() => finish(new Error('页面图片加载超时')), 20000)
    image.onload = () => image.naturalWidth ? finish() : finish(new Error('页面图片尺寸无效'))
    image.onerror = () => finish(new Error('页面图片加载失败'))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort(); else image.src = url
  })
}

export interface NotePdfPage { key: number; svg?: string; thumbnail?: string }
export async function buildNotePdf(pages: NotePdfPage[], options: {
  signal?: AbortSignal; footer?: string; onProgress?: (done: number, total: number) => void
} = {}): Promise<{ blob: Blob; fallbackPages: number[] }> {
  const ensure = () => { if (options.signal?.aborted) throw new DOMException('笔记任务已取消', 'AbortError') }
  ensure()
  if (!pages.length) throw new Error('没有可导出的页面')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true, floatPrecision: 2 })
  const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight()
  const font = pages.some(p => p.svg) ? await ensureCjkPdfFont(pdf) : undefined
  const fallbackPages: number[] = []
  for (const [index, page] of pages.entries()) {
    ensure()
    if (index) pdf.addPage()
    let drawn = false
    if (page.svg) {
      try { drawn = await drawSvgToPdf(pdf, page.svg, { x: 0, y: 0, w, h }, { cjkFont: font }) > 0 }
      catch (error) { ensure(); /* Keep this page and fall back to the official screenshot. */ }
    }
    if (!drawn && page.thumbnail) {
      const response = await fetch(resourceFetchUrl(page.thumbnail), { signal: options.signal })
      if (!response.ok) throw new Error(`第 ${page.key} 页图片下载失败：HTTP ${response.status}`)
      const url = URL.createObjectURL(await response.blob())
      try {
        const image = await loadNoteImage(url, options.signal)
        ensure()
        // Remove partially drawn vector content before the full-page raster fallback.
        pdf.setGState(pdf.GState({ opacity: 1, 'stroke-opacity': 1 }))
        pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, w, h, 'F')
        const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight)
        const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale
        pdf.addImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih)
        drawn = true; fallbackPages.push(page.key)
      } finally { URL.revokeObjectURL(url) }
    }
    // An incomplete PDF must not silently omit pages from the original note.
    if (!drawn) throw new Error(`第 ${page.key} 页没有可导出的画板或截图，已停止导出`)
    ensure()
    if (options.footer) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(100)
      pdf.text(options.footer, w - 20, h - 20, { align: 'right' })
    }
    options.onProgress?.(index + 1, pages.length)
  }
  ensure()
  return { blob: pdf.output('blob'), fallbackPages }
}

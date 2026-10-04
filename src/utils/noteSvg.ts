import JSZip from 'jszip'
import { loadNoteImage, type NotePdfPage } from './notePdf'
import { resourceFetchUrl } from './proxy'

export interface NoteSvgOptions {
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}
function ensure(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('笔记任务已取消', 'AbortError')
}
/** Keep pen paths and text as vectors. Screenshot-only pages remain explicitly raster. */
export async function buildNoteSvgPage(page: NotePdfPage, options: NoteSvgOptions = {}) {
  ensure(options.signal)
  if (page.svg) {
    const doc = new DOMParser().parseFromString(page.svg, 'image/svg+xml')
    if (!doc.querySelector('parsererror') && doc.documentElement.localName === 'svg' &&
        doc.querySelector('path, text, image, rect, circle, ellipse, line, polyline, polygon, use')) {
      // npm noteToSvgs inlines page images. Do not save an SVG tied to temporary
      // blob URLs or signed remote resources that would expire after export.
      for (const image of doc.querySelectorAll('image')) {
        const href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''
        if (href && !href.startsWith('data:image/')) throw new Error(`第 ${page.key} 页图片未内联，已停止导出`)
      }
      ensure(options.signal)
      return { svg: page.svg, fallback: false }
    }
  }
  if (!page.thumbnail) throw new Error(`第 ${page.key} 页没有可导出的画板或截图，已停止导出`)
  const response = await fetch(resourceFetchUrl(page.thumbnail), { signal: options.signal })
  if (!response.ok) throw new Error(`第 ${page.key} 页截图下载失败：HTTP ${response.status}`)
  const url = URL.createObjectURL(await response.blob())
  try {
    const image = await loadNoteImage(url, options.signal)
    ensure(options.signal)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    canvas.getContext('2d')!.drawImage(image, 0, 0)
    return { fallback: true, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><desc>第 ${page.key} 页：原始笔记仅有截图，此页为内嵌位图，不是矢量重建。</desc><image width="${canvas.width}" height="${canvas.height}" href="${canvas.toDataURL('image/png')}"/></svg>` }
  } finally { URL.revokeObjectURL(url) }
}

/** One standalone SVG per original page, preserving mixed-note order and geometry. */
export async function buildNoteSvgArchive(pages: NotePdfPage[], options: NoteSvgOptions = {}) {
  ensure(options.signal)
  if (!pages.length) throw new Error('没有可导出的页面')
  const zip = new JSZip(), manifest: Array<{ page: number; file: string; rendering: string }> = []
  const fallbackPages: number[] = []
  for (const [index, page] of pages.entries()) {
    const result = await buildNoteSvgPage(page, options)
    ensure(options.signal)
    const file = `page-${String(index + 1).padStart(3, '0')}-original-${page.key}.svg`
    zip.file(file, result.svg)
    if (result.fallback) fallbackPages.push(page.key)
    manifest.push({ page: page.key, file, rendering: result.fallback ? 'screenshot' : 'vector' })
    options.onProgress?.(index + 1, pages.length)
  }
  zip.file('pages.json', JSON.stringify(manifest, null, 2))
  zip.file('README.txt', '中育工具箱 · Loshop / aoki\n每页一个 SVG，按原笔记顺序命名。笔迹与文字保留矢量，原始图片仍为位图。\n只有截图的页保持内嵌位图，详见 pages.json 的 screenshot 标记。\nSVG 图片已内联，可离线打开；文字显示采用阅读设备上的字体。\n')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, () => ensure(options.signal))
  ensure(options.signal)
  return { blob, fallbackPages }
}

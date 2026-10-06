import { PDFDocument } from 'pdf-lib'
import { loadPdfjs } from './pdfWorker'
import { encodeCanvasImage } from './canvasImage'
import type { LandscapePdfResult } from './pdfLandscape'

/** Render readable encrypted PDFs locally, then build a new compatible PDF. */
export async function renderEncryptedLandscapePdf(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<LandscapePdfResult> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  try {
    const source = await task.promise
    if (!source.numPages) throw new Error('PDF 中没有可上传的页面')
    const output = await PDFDocument.create()
    const rotatedPages: number[] = []
    for (let index = 1; index <= source.numPages; index++) {
      const page = await source.getPage(index)
      let rotation = ((page.rotate % 360) + 360) % 360
      let viewport = page.getViewport({ scale: 1, rotation })
      if (!(viewport.width > 0 && viewport.height > 0)) throw new Error(`第 ${index} 页尺寸无效`)
      if (viewport.height > viewport.width) {
        rotation = (rotation + 270) % 360
        rotatedPages.push(index)
        viewport = page.getViewport({ scale: 1, rotation })
      }
      // Bound each page's raster memory, retaining its entire visible crop box.
      const scale = Math.min(3, 2880 / Math.max(viewport.width, viewport.height))
      const rendered = page.getViewport({ scale, rotation })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(rendered.width)
      canvas.height = Math.ceil(rendered.height)
      try {
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建 PDF 渲染画布')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: context, viewport: rendered, intent: 'print' }).promise
        const blob = await encodeCanvasImage(canvas, 'image/png', 1)
        const image = await output.embedPng(await blob.arrayBuffer())
        output.addPage([viewport.width, viewport.height]).drawImage(image, {
          x: 0, y: 0, width: viewport.width, height: viewport.height
        })
        // Compress/register now so PDFImage can release the decoded RGB buffers.
        await image.embed()
      } finally {
        canvas.width = 0
        canvas.height = 0
        page.cleanup()
      }
      onProgress?.(index, source.numPages)
    }
    const bytes = await output.save()
    return {
      file: new File([bytes as BlobPart], file.name.replace(/\.pdf$/i, '') + '-兼容横版.pdf', {
        type: 'application/pdf', lastModified: file.lastModified
      }),
      totalPages: source.numPages, rotatedPages, renderedFromEncrypted: true
    }
  } catch (error: any) {
    if (error?.name === 'PasswordException') throw new Error('此 PDF 需要打开密码。请先在 PDF 阅读器中输入密码，并另存为无需打开密码的副本后上传。')
    throw error
  } finally {
    await task.destroy()
  }
}

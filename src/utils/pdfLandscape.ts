import { PDFDocument, degrees } from 'pdf-lib'

export interface LandscapePdfResult {
  file: File
  totalPages: number
  rotatedPages: number[]
  /** Encrypted input was locally rendered, rather than rewritten as vector content. */
  renderedFromEncrypted?: boolean
}

/** Preserve PDF content and crop boxes; change only portrait pages' display rotation. */
export async function prepareLandscapePdf(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<LandscapePdfResult> {
  // Read encryption metadata only; never save encrypted streams with pdf-lib.
  const document = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  if (document.isEncrypted) {
    const { renderEncryptedLandscapePdf } = await import('./pdfEncrypted')
    return renderEncryptedLandscapePdf(file, onProgress)
  }
  const pages = document.getPages()
  if (!pages.length) throw new Error('PDF 中没有可上传的页面')
  const rotatedPages: number[] = []
  for (const [index, page] of pages.entries()) {
    const rotation = ((page.getRotation().angle % 360) + 360) % 360
    const { width, height } = page.getCropBox()
    if (width <= 0 || height <= 0) throw new Error(`第 ${index + 1} 页尺寸无效`)
    const sideways = rotation === 90 || rotation === 270
    const visibleWidth = sideways ? height : width
    const visibleHeight = sideways ? width : height
    if (visibleHeight > visibleWidth) {
      page.setRotation(degrees((rotation + 270) % 360))
      rotatedPages.push(index + 1)
    }
    onProgress?.(index + 1, pages.length)
    // Yield to the UI periodically, without rasterizing or uploading the source.
    if (index % 25 === 24) await new Promise(resolve => setTimeout(resolve, 0))
  }
  if (!rotatedPages.length) return { file, totalPages: pages.length, rotatedPages }
  const bytes = await document.save()
  const prepared = new File([bytes as BlobPart], file.name.replace(/\.pdf$/i, '') + '-横版.pdf', {
    type: 'application/pdf', lastModified: file.lastModified
  })
  return { file: prepared, totalPages: pages.length, rotatedPages }
}

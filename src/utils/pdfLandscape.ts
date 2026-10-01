import { PDFDocument, degrees } from 'pdf-lib'

export type RotationMode = 'none' | 'cw90' | 'ccw90' | '180'

export interface LandscapePdfResult {
  file: File
  totalPages: number
  rotatedPages: number[]
}

/**
 * 按所选旋转模式处理 PDF 页面方向（默认不旋转）。
 * 仅修改页面显示旋转，不改动页面内容，原文件不被覆盖。
 */
export async function prepareLandscapePdf(
  file: File,
  rotationMode: RotationMode = 'none',
  onProgress?: (current: number, total: number) => void
): Promise<LandscapePdfResult> {
  const document = await PDFDocument.load(await file.arrayBuffer())
  const pages = document.getPages()
  if (!pages.length) throw new Error('PDF 中没有可上传的页面')
  const rotatedPages: number[] = []
  const deltaByMode: Record<RotationMode, number> = { none: 0, cw90: 90, ccw90: -90, '180': 180 }
  const delta = deltaByMode[rotationMode]
  for (const [index, page] of pages.entries()) {
    const rotation = ((page.getRotation().angle % 360) + 360) % 360
    if (delta !== 0) {
      page.setRotation(degrees(((rotation + delta) % 360 + 360) % 360))
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

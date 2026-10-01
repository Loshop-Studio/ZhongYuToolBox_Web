import { PDFDocument, degrees } from 'pdf-lib'

self.onmessage = async (event: MessageEvent<{ files: File[]; rotations?: Array<number | null> }>) => {
  try {
    const files = event.data.files
    if (!files.length) throw new Error('请先选择图片')
    const pdf = await PDFDocument.create()
    for (const [index, file] of files.entries()) {
      let bitmap: ImageBitmap
      try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
      catch { throw new Error(`无法读取图片：${file.name}`) }
      try {
        const ratio = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height))
        const width = Math.max(1, Math.round(bitmap.width * ratio))
        const height = Math.max(1, Math.round(bitmap.height * ratio))
        const canvas = new OffscreenCanvas(width, height)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('无法创建图片画布')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(bitmap, 0, 0, width, height)
        // PNG keeps text/diagram edges and flattens transparency onto white.
        const png = await canvas.convertToBlob({ type: 'image/png' })
        const image = await pdf.embedPng(await png.arrayBuffer())
        const pageWidth = 720 * width / Math.max(width, height)
        const pageHeight = 720 * height / Math.max(width, height)
        const page = pdf.addPage([pageWidth, pageHeight])
        page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight })
        const manual = event.data.rotations?.[index]
        const steps = manual == null ? (height > width ? 1 : 0) : manual
        page.setRotation(degrees((360 - steps * 90) % 360))
      } finally { bitmap.close() }
      ;(self as any).postMessage({ progress: index + 1, total: files.length })
    }
    const bytes = await pdf.save()
    ;(self as any).postMessage({ bytes: bytes.buffer }, [bytes.buffer])
  } catch (error) {
    (self as any).postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}

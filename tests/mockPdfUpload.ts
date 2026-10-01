import { PDFDocument } from 'pdf-lib'
import { convertPdfToImages } from '../src/utils/pdf'
export { generateCustomFileId } from '../src/api/pdfNote'
export async function uploadPdfAsNote(options: any) {
  if (options.file?.type !== 'application/pdf') throw new Error('图片未先转换成 PDF')
  const pdf = await PDFDocument.load(await options.file.arrayBuffer())
  if (!options.fileId && (pdf.getPageCount() !== 2 || pdf.getPage(0).getRotation().angle !== 270 || pdf.getPage(1).getRotation().angle !== 0)) throw new Error('顺序或方向错误')
  if (options.rotationMode && options.rotationMode !== 'none') throw new Error('已处理文件不应重复旋转')
  const rows = await convertPdfToImages(options.file, undefined, { canvasSize: { width: 720, height: 450 } })
  for (const n of [0, 5, 20, 90, 97, 100]) { options.onProgress(n, '离线上传衔接验证 ' + n + '%'); await new Promise(resolve => setTimeout(resolve, 40)) }
  const report = document.createElement('pre'); report.id = 'mock-upload-result'; report.textContent = JSON.stringify({ passed: true, name: options.noteName, pages: rows.length, remoteWrites: 0 })
  document.body.appendChild(report)
  return rows
}

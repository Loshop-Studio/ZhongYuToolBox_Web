import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { safeQuestionHtml } from './questionHtml'
import { resourceFetchUrl } from './proxy'

export interface ExportQuestion { title: string; stem: string; answer?: string; analysis?: string }
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw new Error('已取消导出') }
function breakAtWhitespace(canvas: HTMLCanvasElement, offset: number, maximum: number): number {
  if (offset + maximum >= canvas.height) return maximum
  const lookback = Math.min(120, Math.floor(maximum / 4))
  if (lookback < 4) return maximum
  const pixels = canvas.getContext('2d')!.getImageData(0, offset + maximum - lookback, canvas.width, lookback).data
  let whiteRows = 0
  for (let y = lookback - 1; y >= 0; y--) {
    let white = true
    for (let x = 0; x < canvas.width; x++) {
      const at = (y * canvas.width + x) * 4
      if (pixels[at] < 245 || pixels[at + 1] < 245 || pixels[at + 2] < 245) { white = false; break }
    }
    whiteRows = white ? whiteRows + 1 : 0
    if (whiteRows >= 3) return maximum - lookback + y + 1
  }
  return maximum
}

/** Resolve images locally before rendering; never silently export missing diagrams. */
export async function renderQuestion(question: ExportQuestion, answers: boolean, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  checkAbort(signal)
  const element = document.createElement('div')
  element.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;padding:24px;box-sizing:border-box;background:#fff;color:#222;font:18px/1.75 "Smiley Sans",sans-serif;'
  const heading = document.createElement('h3'); heading.textContent = question.title; element.append(heading)
  const content = document.createElement('div')
  content.innerHTML = safeQuestionHtml(question.stem) + (answers ? '<hr><h4>答案与解析</h4>' + safeQuestionHtml(question.answer || '') + safeQuestionHtml(question.analysis || '') : '')
  element.append(content)
  const urls: string[] = []
  document.body.append(element)
  try {
    for (const image of [...element.querySelectorAll('img')]) {
      checkAbort(signal)
      const response = await fetch(resourceFetchUrl(image.src), { signal })
      if (!response.ok) throw new Error('题目图片读取失败：' + response.status)
      const url = URL.createObjectURL(await response.blob()); urls.push(url)
      image.src = url; image.style.cssText = 'max-width:100%;height:auto;object-fit:contain;'
      try { await image.decode() } catch { throw new Error('题目图片无法解码') }
    }
    await document.fonts.ready
    // Uniformly scale wide tables instead of clipping their right edge.
    const width = Math.max(720, element.scrollWidth)
    element.style.width = width + 'px'
    const height = element.scrollHeight
    if (height > 24000 || width > 10000) throw new Error('单题内容过大，请单独导出')
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(element, { scale: Math.min(2, 10000 / Math.max(width, height)), backgroundColor: '#fff', logging: false, width, height, windowWidth: Math.max(window.innerWidth, width) })
    checkAbort(signal)
    return canvas
  } finally { element.remove(); urls.forEach(url => URL.revokeObjectURL(url)) }
}

/** Keep a question on one A4 page where possible; long questions continue without dropping pixels. */
export async function createMistakePdf(subject: string, questions: ExportQuestion[], answers = true,
  onProgress?: (current: number, total: number) => void, signal?: AbortSignal): Promise<Blob> {
  if (!questions.length) throw new Error('该科目暂无可导出的错题')
  const pdf = await PDFDocument.create()
  pdf.setTitle(subject + ' - 错题本'); pdf.setAuthor('Loshop; co-author: aoki')
  const width = 595.28, height = 841.89, margin = 32, bottom = height - margin - 20
  let page = pdf.addPage([width, height]), y = margin
  for (let index = 0; index < questions.length; index++) {
    checkAbort(signal)
    const canvas = await renderQuestion({ ...questions[index], title: `${subject} · ${index + 1}. ${questions[index].title}` }, answers, signal)
    const scale = (width - 2 * margin) / canvas.width
    const renderedHeight = canvas.height * scale
    if (y > margin && renderedHeight > bottom - y) { page = pdf.addPage([width, height]); y = margin }
    let offset = 0
    while (offset < canvas.height) {
      checkAbort(signal)
      const maximum = Math.min(canvas.height - offset, Math.floor((bottom - y) / scale))
      const rows = maximum > 0 ? breakAtWhitespace(canvas, offset, maximum) : 0
      if (rows <= 0) { page = pdf.addPage([width, height]); y = margin; continue }
      const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = rows
      slice.getContext('2d')!.drawImage(canvas, 0, offset, canvas.width, rows, 0, 0, canvas.width, rows)
      const image = await pdf.embedPng(slice.toDataURL('image/png'))
      page.drawImage(image, { x: margin, y: height - y - rows * scale, width: width - 2 * margin, height: rows * scale })
      offset += rows; y += rows * scale
      slice.width = slice.height = 0
      if (offset < canvas.height) { page = pdf.addPage([width, height]); y = margin }
    }
    y += 14; canvas.width = canvas.height = 0
    onProgress?.(index + 1, questions.length)
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.getPages().forEach((page, index, pages) => page.drawText(`${index + 1} / ${pages.length}   ZhongYuToolBox | aoki`, { x: margin, y: 18, size: 9, font, color: rgb(.4, .4, .4) }))
  return new Blob([Uint8Array.from(await pdf.save()).buffer], { type: 'application/pdf' })
}

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { safeQuestionHtml } from './questionHtml'
import { resourceFetchUrl } from './proxy'

export interface ExportQuestion { title: string; stem: string; answer?: string; analysis?: string }
let printFont: Promise<void> | undefined
/** Load the bundled OFL Song typeface lazily, avoiding WebView2 system-font fallback. */
export function loadMistakePrintFont(): Promise<void> {
  return printFont ||= (async () => {
    const url = new URL(import.meta.env.BASE_URL + 'fonts/SourceHanSerifCN-Regular.otf', location.origin + '/')
    const style = document.createElement('style')
    style.textContent = `@font-face{font-family:"Aoki PDF Song";src:url("${url.href}") format("opentype");font-weight:400;font-style:normal;font-display:block}`
    document.head.append(style)
    try { if (!(await document.fonts.load('16.28px "Aoki PDF Song"')).length) throw new Error('字体未载入') }
    catch (error) {style.remove(); throw error}
  })().catch(error => {printFont = undefined; throw new Error('PDF 宋体加载失败：' + (error as Error).message)})
}
export function mistakePdfSections(subject: string, questions: ExportQuestion[], answers: boolean) {
  const numbered = questions.map((question, index) => ({...question, title: `${index + 1}. ${question.title}`}))
  return [
    {title: subject + ' · 题目', questions: numbered.map(q => ({title:q.title, stem:q.stem}))},
    ...(answers ? [{title:subject + ' · 答案与解析', questions:numbered.map(q => ({title:q.title,
      stem:'<h4>答案</h4>' + (q.answer || '<p>官方未提供答案。</p>') + '<h4>解析</h4>' + (q.analysis || '<p>官方未提供解析。</p>')}))}] : [])
  ]
}
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
  await loadMistakePrintFont(); checkAbort(signal)
  const element = document.createElement('div')
  element.className = 'aoki-mistake-print'
  // 16.28 CSS px × (531.28 / 720) gives approximately 12 pt in the A4 PDF.
  // Source Han Serif CN is bundled under OFL, avoiding unavailable system fonts.
  element.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;padding:0;box-sizing:border-box;background:#fff;color:#111;font:16.28px/1.5 "Aoki PDF Song",serif;'
  const heading = document.createElement('h3'); heading.textContent = question.title; heading.style.cssText = 'font:inherit;font-weight:bold;margin:0 0 6px'; element.append(heading)
  const content = document.createElement('div')
  content.innerHTML = safeQuestionHtml(question.stem) + (answers ? '<hr><h4>答案与解析</h4>' + safeQuestionHtml(question.answer || '') + safeQuestionHtml(question.analysis || '') : '')
  for (const node of content.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,ul,ol,blockquote')) {
    node.style.marginTop = '4px'; node.style.marginBottom = '4px'; node.style.fontSize = 'inherit'; node.style.lineHeight = 'inherit'
  }
  element.append(content)
  const urls: string[] = []
  document.body.append(element)
  try {
    const { prepareMistakeMath } = await import('./mistakeMath')
    await prepareMistakeMath(content); checkAbort(signal)
    for (const image of [...element.querySelectorAll('img')]) {
      checkAbort(signal)
      const response = await fetch(resourceFetchUrl(image.src), { signal })
      if (!response.ok) throw new Error('题目图片读取失败：' + response.status)
      const url = URL.createObjectURL(await response.blob()); urls.push(url)
      image.src = url; image.style.cssText = 'max-width:100%;height:auto;object-fit:contain;'
      // Preserve the editor's display width instead of enlarging high-DPI images.
      const declaredWidth = Number(image.getAttribute('width')), declaredHeight = Number(image.getAttribute('height'))
      try { await image.decode() } catch { throw new Error('题目图片无法解码') }
      if (declaredWidth > 0) image.style.width = declaredWidth + 'px'
      else if (declaredHeight > 0) image.style.width = (declaredHeight * image.naturalWidth / image.naturalHeight) + 'px'
      if (image.dataset.printWidth) image.style.width = image.dataset.printWidth
      else if (image.dataset.printHeight) image.style.width = (parseFloat(image.dataset.printHeight) * parseFloat(getComputedStyle(image).fontSize) * image.naturalWidth / image.naturalHeight) + 'px'
      // Inline bitmap formulas have no text baseline: align their centre with the
      // surrounding text, instead of putting the image's bottom on the baseline.
      if (image.getBoundingClientRect().height <= 4 * parseFloat(getComputedStyle(image).fontSize)
        && image.parentElement?.textContent?.trim()) image.style.verticalAlign = 'middle'
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

/** Compact 12 pt SimSun layout; questions continue in remaining space without dropping pixels. */
export async function createMistakePdf(subject: string, questions: ExportQuestion[], answers = true,
  onProgress?: (current: number, total: number) => void, signal?: AbortSignal): Promise<Blob> {
  if (!questions.length) throw new Error('该科目暂无可导出的错题')
  const pdf = await PDFDocument.create()
  pdf.setTitle(subject + ' - 错题本'); pdf.setAuthor('Loshop')
  const width = 595.28, height = 841.89, margin = 32, bottom = height - margin - 20
  let page = pdf.addPage([width, height]), y = margin, done = 0
  const sections = mistakePdfSections(subject, questions, answers), total = questions.length * sections.length
  const append = async (question: ExportQuestion) => {
    checkAbort(signal)
    const canvas = await renderQuestion(question, false, signal)
    const scale = (width - 2 * margin) / canvas.width
    // Avoid a stranded title, but do not move a long question to an empty page.
    if (bottom - y < 60) { page = pdf.addPage([width, height]); y = margin }
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
    y += 8; canvas.width = canvas.height = 0
  }
  for (const [index, section] of sections.entries()) {
    if (index > 0) { page = pdf.addPage([width, height]); y = margin }
    await append({title:section.title, stem:`<p>共 ${questions.length} 题 · ${index === 0 ? (answers ? '题目按顺序编号，答案与解析见后面的独立部分。' : '题目按顺序编号。') : '编号与前面的题目一一对应。'}</p>`})
    for (const question of section.questions) { await append(question); onProgress?.(++done,total) }
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  // Helvetica uses WinAnsi: keep the footer ASCII to avoid failing every export.
  pdf.getPages().forEach((page, index, pages) => page.drawText(`${index + 1} / ${pages.length}   ZhongYuToolBox`, { x: margin, y: 18, size: 9, font, color: rgb(.4, .4, .4) }))
  return new Blob([Uint8Array.from(await pdf.save()).buffer], { type: 'application/pdf' })
}

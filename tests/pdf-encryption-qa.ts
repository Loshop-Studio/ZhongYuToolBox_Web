import { PDFDocument } from 'pdf-lib'
import { prepareLandscapePdf } from '../src/utils/pdfLandscape'
import { loadPdfjs } from '../src/utils/pdfWorker'
import rc4 from './fixtures/pdf-encryption/rc4-readable.pdf?url'
import aes128 from './fixtures/pdf-encryption/aes128-readable.pdf?url'
import aes256 from './fixtures/pdf-encryption/aes256-readable.pdf?url'
import locked from './fixtures/pdf-encryption/requires-password.pdf?url'

const output = document.querySelector('#result')!
const lines: string[] = []
function assert(value: unknown, text: string): asserts value { if (!value) throw new Error(text) }
async function render(page: any, rotation = page.rotate) {
  const base = page.getViewport({ scale: 1, rotation })
  const viewport = page.getViewport({ scale: 420 / Math.max(base.width, base.height), rotation })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
  await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff', intent: 'print' }).promise
  return canvas
}
async function run() {
try {
  const pdfjs = await loadPdfjs()
  for (const [name, url] of [['RC4', rc4], ['AES-128', aes128], ['AES-256', aes256]]) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    const file = new File([bytes], name + '.pdf', { type: 'application/pdf' })
    const converted = await prepareLandscapePdf(file)
    assert(converted.renderedFromEncrypted && converted.totalPages === 4, name + ' 加密转换/页数错误')
    assert(JSON.stringify(converted.rotatedPages) === '[1,3]', name + ' 逆时针方向错误')
    assert(new Uint8Array(await file.arrayBuffer()).every((b, i) => b === bytes[i]), '原文件被改写')
    const result = await PDFDocument.load(await converted.file.arrayBuffer())
    assert(!result.isEncrypted && result.getPageCount() === 4, '兼容 PDF 仍加密或漏页')
    const originalTask = pdfjs.getDocument({ data: bytes.slice() })
    const newTask = pdfjs.getDocument({ data: await converted.file.arrayBuffer() })
    try {
      const original = await originalTask.promise, prepared = await newTask.promise
      for (let i = 1; i <= 4; i++) {
        const originalPage = await original.getPage(i), newPage = await prepared.getPage(i)
        const originalViewport = originalPage.getViewport({ scale: 1 })
        const rotation = originalViewport.height > originalViewport.width ? (originalPage.rotate + 270) % 360 : originalPage.rotate
        const left = await render(originalPage, rotation), right = await render(newPage)
        assert(left.width === right.width && left.height === right.height, '页面边界/旋转丢失')
        const before = left.getContext('2d')!.getImageData(0, 0, left.width, left.height).data
        const after = right.getContext('2d')!.getImageData(0, 0, right.width, right.height).data
        let error = 0, green = 0
        for (let p = 0; p < before.length; p += 4) {
          error += Math.abs(before[p] - after[p]) + Math.abs(before[p + 1] - after[p + 1]) + Math.abs(before[p + 2] - after[p + 2])
          if (after[p + 1] > after[p] + 40 && after[p + 1] > after[p + 2] + 40) green++
        }
        assert(error / (before.length * 0.75) < 4 && green > 60, '渲染内容缺失、空白或裁切')
        if (name === 'AES-128' && i === 1) for (const [title, canvas] of [['原加密 PDF（旋转后）', left], ['兼容 PDF', right]] as const) {
          const image = document.createElement('img'); image.src = canvas.toDataURL(); image.alt = title; image.title = title
          document.querySelector('#preview')!.append(image)
        }
        left.width = right.width = 0
      }
    } finally { await originalTask.destroy(); await newTask.destroy() }
    lines.push('PASS ' + name + '：4 页、逆时针旋转、未裁切、非空白、原文件不变')
    output.textContent = lines.join('\n')
  }
  const file = new File([await (await fetch(locked)).arrayBuffer()], 'locked.pdf')
  try { await prepareLandscapePdf(file); throw new Error('密码保护文件未被识别') }
  catch (error) { assert((error as Error).message.includes('需要打开密码'), '缺少明确密码提示') }
  lines.push('PASS 需要打开密码：明确中文提示，未上传')
  output.className = 'pass'; lines.push('全部通过')
} catch (error) { output.className = 'fail'; lines.push('FAIL ' + (error as Error).message) }
output.textContent = lines.join('\n')
}
void run()

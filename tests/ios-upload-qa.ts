// Simulator-only regression page. Official writes are replaced with local test responses.
import { PDFDocument, rgb } from 'pdf-lib'
import { convertPdfToImages } from '../src/utils/pdf'
import { imagesToPdf } from '../src/utils/imagesToPdf'
import { uploadPdfAsNote } from '../src/api/pdfNote'
import { fetchUserId, uploadFile } from '../src/utils/oss'
import { addPicture } from '../src/api/picture'

const report = document.querySelector('#report')!, status = document.querySelector('#status')!
const checks: string[] = [], calls: { url: string; method: string; bytes?: number }[] = []
function check(ok: unknown, label: string) { if (!ok) throw new Error(label); checks.push(label); report.textContent = checks.join('\n') }
const nativeFetch = window.fetch.bind(window), nativeToBlob = HTMLCanvasElement.prototype.toBlob
if (!(window as any).nativeHost) (window as any).nativeHost = {
  readNoteTemplate: async (relative: string) => {
    const response = await nativeFetch(location.origin + '/example/' + relative)
    if (!response.ok) throw new Error('测试模板加载失败')
    return new Uint8Array(await response.arrayBuffer())
  }
}
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
  if (url.origin === location.origin) {
    // Browser preview has no native template reader; the nested QA page must
    // resolve the same packaged /example directory as the real iOS bridge.
    if (url.pathname.startsWith('/tests/example/')) return nativeFetch(location.origin + url.pathname.replace('/tests/example/', '/example/'), options)
    return nativeFetch(input, options)
  }
  const method = options.method || 'GET'
  const bytes = options.body instanceof Blob ? options.body.size : undefined
  calls.push({ url: url.href, method, bytes })
  if (url.hostname === 'sxz.api.zykj.org') {
    if (url.pathname.endsWith('/User/GetInfoAsync')) return json({ success: true, result: { userId: 101 } })
    if (url.pathname.endsWith('/GenerateTokenV2Async')) return json({ result: { bucket: 'ios-test-bucket', endpoint: 'http://ios-test-bucket.oss-cn-hangzhou.aliyuncs.com', accessKeyId: 'TEST_ONLY_ID', accessKeySecret: 'TEST_ONLY_SECRET', securityToken: 'TEST_ONLY_STS' } })
    if (url.pathname.startsWith('/CloudNotes/api/') && url.pathname.endsWith('/AddOrUpdate')) return json({ code: 0 })
    if (url.pathname.endsWith('/PictureLibrary/AddPictureAsync')) return json({ success: true, result: true })
  }
  if (url.hostname === 'ios-test-bucket.oss-cn-hangzhou.aliyuncs.com' && method === 'PUT') {
    check(url.protocol === 'https:', 'STS 返回 HTTP endpoint，上传实际使用 HTTPS')
    check(bytes && bytes > 0, '上传文件非空：' + url.pathname.split('/').at(-1))
    if (url.pathname.endsWith('.webp')) {
      const header = new Uint8Array(await (options.body as Blob).slice(0, 12).arrayBuffer())
      check(String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8)) === 'WEBP', '笔记上传为真实 WebP 字节')
    }
    return new Response('', { status: 200 })
  }
  throw new Error('测试禁止实际访问远程服务：' + method + ' ' + url.href)
}
HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
  // Reproduce Safari's unsupported WebP encoder, returning real PNG rather than faking its MIME.
  return nativeToBlob.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality)
}
async function decoded(blob: Blob) {
  const image = new Image(), url = URL.createObjectURL(blob)
  try { image.src = url; await image.decode(); return image } finally { URL.revokeObjectURL(url) }
}
async function run() {
  if ((window as any).webkit?.messageHandlers?.zytb) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000)
    try {
      // Real URLSession HEAD, no credentials and no cloud writes. A 404 is expected:
      // reaching any HTTP response proves the app no longer hits ATS error -1022.
      const response = await nativeFetch('http://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/__ios_ats_probe__', { method: 'HEAD', credentials: 'omit', signal: controller.signal })
      check(response.status >= 200 && response.status < 600, '真实原生 OSS HTTP 地址转 HTTPS：收到服务器响应，无 ATS 拦截')
    } finally { clearTimeout(timeout) }
  }
  const pdf = await PDFDocument.create()
  for (let i = 0; i < 2; i++) {
    const page = pdf.addPage([720, 450])
    for (const [x, y] of [[0, 0], [660, 0], [0, 390], [660, 390]]) page.drawRectangle({ x, y, width: 60, height: 60, color: rgb(1, 0, 0) })
    page.drawText('iOS local upload ' + (i + 1), { x: 90, y: 225, size: 22 })
  }
  const file = new File([await pdf.save() as BlobPart], 'IOS_UPLOAD_TEST_ONLY.pdf', { type: 'application/pdf' })
  const pages = await convertPdfToImages(file, undefined, { type: 'image/webp', quality: .96, canvasSize: { width: 2880, height: 1800 } })
  check(pages.length === 2, '两页 PDF 完整渲染')
  for (const page of pages) {
    const image = await decoded(page.blob)
    check(image.naturalWidth === 2880 && image.naturalHeight === 1800, 'WebP 尺寸保持 2880 × 1800')
    const canvas = document.createElement('canvas'); canvas.width = 2880; canvas.height = 1800
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0)
    for (const [x, y] of [[20, 20], [2860, 20], [20, 1780], [2860, 1780]]) {
      const pixel = ctx.getImageData(x, y, 1, 1).data
      check(pixel[0] > 180 && pixel[1] < 80 && pixel[2] < 80, '页面四角内容保留，无裁切')
    }
  }
  const uploaded = await uploadPdfAsNote({ file, noteName: 'IOS_UPLOAD_TEST_ONLY', autoLandscape: false })
  check(uploaded.length === 2 && calls.filter(c => c.url.includes('/CloudNotes/api/Notes/AddOrUpdate')).length === 1, 'PDF 两页上传与笔记登记完成（模拟官方接口）')
  const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 200
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 100, 200)
  const png = await new Promise<Blob>(resolve => nativeToBlob.call(canvas, blob => resolve(blob!), 'image/png'))
  const imageFile = new File([png], 'IOS_UPLOAD_TEST_ONLY.png', { type: 'image/png' })
  const imagePdf = await imagesToPdf([imageFile], 'IOS_UPLOAD_TEST_ONLY', undefined, undefined, [1])
  await uploadPdfAsNote({ file: imagePdf, noteName: 'IOS_UPLOAD_TEST_ONLY image', autoLandscape: false })
  check(calls.filter(c => c.url.includes('/CloudNotes/api/Notes/AddOrUpdate')).length === 2, '图片逆时针旋转、转 PDF、上传云笔记完成')
  const before = calls.length
  check(await fetchUserId() === '101' && calls.length === before, '图库复用登录用户 ID，无额外网络查询')
  localStorage.removeItem('userId')
  check(await fetchUserId() === '101', '备用鉴权查询支持官方 userId 字段')
  const url = await uploadFile(imageFile, '101', 'note_v2')
  await addPicture(url, imageFile.name, String(imageFile.size))
  check(calls.some(c => c.url.includes('/PictureLibrary/AddPictureAsync')) && calls.some(c => c.url.endsWith('.png') && c.bytes === imageFile.size), '图库原始图片上传、官方登记完成（模拟接口）')
  status.textContent = 'iOS上传回归通过'
  report.textContent = checks.join('\n') + '\nPASS: ' + checks.length + ' checks. No real account or cloud writes.'
}
run().catch(error => { status.textContent = 'iOS上传回归失败'; report.textContent += '\n' + (error.stack || error) }).finally(() => {
  HTMLCanvasElement.prototype.toBlob = nativeToBlob; window.fetch = nativeFetch
  // Never leave the mock JWT to make the next UI test contact real official APIs.
  localStorage.clear()
})

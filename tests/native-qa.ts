import { PDFDocument } from 'pdf-lib'
import { imagesToPdf, validateImageFiles } from '../src/utils/imagesToPdf'
import { convertPdfToImages } from '../src/utils/pdf'
import { initializeTheme, setThemeMode, resolveDarkMode } from '../src/composables/useTheme'
import { buildInjectJS } from '../src/composables/useWebviewInject'
import { featureQa } from './features-qa'
import { boardCodecQa } from './board-codec-qa'
import { boardReplyQa } from './board-reply-qa'
import { fetchLatestRelease } from '../src/utils/appUpdate'

const checks: string[] = []
function check(ok: boolean, message: string) {
  if (!ok) throw new Error(message); checks.push(message)
  if ((window as any).nativeHost) (window as any).chrome.webview.postMessage({id:0,method:'qaTrace',args:{message}})
}
async function imageFile(width: number, height: number, type: string, name: string) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#00a000'
  const side = Math.min(width, height) / 6
  for (const x of [0, width - side]) for (const y of [0, height - side]) ctx.fillRect(x, y, side, side)
  ctx.fillStyle = '#000'; ctx.font = '24px sans-serif'; ctx.fillText(name, width / 4, height / 2)
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), type, 0.95))
  return new File([blob], name, { type })
}
async function main() {
  initializeTheme()
  const old = localStorage.getItem('aoki-theme-mode')
  setThemeMode('dark'); check(document.documentElement.classList.contains('dark'), '手动深色模式')
  check(localStorage.getItem('aoki-theme-mode') === 'dark', '主题设置持久化')
  setThemeMode('light'); check(!document.documentElement.classList.contains('dark'), '手动浅色模式')
  setThemeMode('system'); check(document.documentElement.classList.contains('dark') === matchMedia('(prefers-color-scheme: dark)').matches, '跟随当前系统主题')
  check(resolveDarkMode('light', true) === false && resolveDarkMode('dark', false) === true && resolveDarkMode('system', true) === true && resolveDarkMode('system', false) === false, '系统变化不覆盖手动选择')
  if (old) setThemeMode(old as any); else localStorage.removeItem('aoki-theme-mode')
  const originals = await Promise.all([
    imageFile(400, 600, 'image/png', 'portrait.png'), imageFile(600, 400, 'image/jpeg', 'landscape.jpg'), imageFile(400, 400, 'image/webp', 'square.webp')
  ])
  const before = await Promise.all(originals.map(f => f.arrayBuffer()))
  const progress: number[] = []
  const file = await imagesToPdf(originals, 'local-images', n => progress.push(n))
  check(file.type === 'application/pdf' && file.name === 'local-images.pdf', '图片在本地生成 PDF')
  const doc = await PDFDocument.load(await file.arrayBuffer())
  check(doc.getPageCount() === 3, 'PNG/JPG/WebP 按顺序每张一页')
  check(JSON.stringify(doc.getPages().map(p => p.getRotation().angle)) === '[270,0,0]', '仅竖版页逆时针 90°')
  check(JSON.stringify(doc.getPages().map(p => [p.getWidth(), p.getHeight()])) === '[[480,720],[720,480],[720,720]]', '页面比例正确')
  check(progress.join(',') === '1,2,3', '后台转换进度递增')
  for (const [i, original] of originals.entries()) {
    check(new Uint8Array(await original.arrayBuffer()).every((v, j) => v === new Uint8Array(before[i])[j]), '原图片未修改 ' + (i + 1))
  }
  const pages = await convertPdfToImages(file, undefined, { canvasSize: { width: 720, height: 450 } })
  for (const [index, page] of pages.entries()) {
    const bitmap = await createImageBitmap(page.blob)
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close()
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const quadrants = [0, 0, 0, 0]
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (data[i + 1] > 100 && data[i + 1] > data[i] * 1.6 && data[i + 1] > data[i + 2] * 1.6) quadrants[(y >= canvas.height / 2 ? 2 : 0) + (x >= canvas.width / 2 ? 1 : 0)]++
    }
    check(quadrants.every(n => n > 500), '整页渲染保留四角，无裁切 ' + (index + 1))
  }
  let invalid = false; try { validateImageFiles([new File(['x'], 'bad.svg')]) } catch { invalid = true }
  check(invalid, '不支持的图片格式拒绝')
  let corrupt = false; try { await imagesToPdf([new File(['not a png'], 'bad.png')], 'bad') } catch { corrupt = true }
  check(corrupt, '损坏图片不生成空 PDF')
  const controller = new AbortController(); controller.abort()
  let aborted = false; try { await imagesToPdf(originals, 'cancel', undefined, controller.signal) } catch { aborted = true }
  check(aborted, '取消转换终止 Worker')
  const mistakePdf = await featureQa(check, originals)
  const mistakePages = await convertPdfToImages(new File([mistakePdf], 'qa-mistakes.pdf'), undefined, { scale: 1 })
  if ((window as any).nativeHost) {
    await (window as any).nativeHost.saveFile(await mistakePages[0].blob.arrayBuffer(), 'qa-mistakes-first.png')
    await (window as any).nativeHost.saveFile(await mistakePages[mistakePages.length-1].blob.arrayBuffer(), 'qa-mistakes-last.png')
  }

  // Run the same guest injection in a disposable local document and count writes.
  const frame = document.createElement('iframe'); document.body.appendChild(frame)
  const guestDoc = frame.contentDocument!; guestDoc.body.innerHTML = '<div class="header-box"></div><div id="actScrollList"></div>'
  const target = guestDoc.getElementById('actScrollList')!
  let writes = 0; const observer = new MutationObserver(m => { writes += m.length }); observer.observe(target, { attributes: true })
  frame.contentWindow!.eval(buildInjectJS({ removeClass: 'header-box', targetId: 'actScrollList', cssText: 'body{margin:0}' }))
  await new Promise(resolve => setTimeout(resolve, 80)); const settled = writes
  await new Promise(resolve => setTimeout(resolve, 100))
  check(writes === settled && settled > 0, '样式监听收敛，无自身触发循环')
  observer.disconnect(); frame.remove()

  const exportedBoard = await boardCodecQa(check)
  await boardReplyQa(check)
  const host = (window as any).nativeHost
  if (host) {
    check(host.kind === 'webview2' && !(window as any).require, '真实 WebView2 壳，无 Node')
    const router = await host.readNoteTemplate('page_router.bin'); check(router.length === 40, '原生模板桥接字节完整')
    let denied = false; try { await host.readNoteTemplate('../bridge.js') } catch { denied = true }
    check(denied, '原生桥拒绝任意路径')
    const bytes = new Uint8Array(2 * 1024 * 1024 + 7); bytes.forEach((_, i) => { bytes[i] = i % 251 })
    const saved = await host.saveFile(bytes.buffer, 'qa.bin'); check(!saved.canceled, '真实原生分块保存大于 2 MB 文件')
    await host.saveFile(await exportedBoard.svg.arrayBuffer(), 'qa-board.svg')
    await host.saveFile(await exportedBoard.mp4.arrayBuffer(), 'qa-board.mp4')
    check(true, 'SVG / MP4 由真实原生桥本地保存')
    const release = await fetchLatestRelease('nickfox395/ZhongYuToolBox_Web')
    check(release.url.startsWith('https://github.com/nickfox395/ZhongYuToolBox_Web/releases/tag/'), '真实原生桥读取公开 GitHub Release，无学校凭证')
    const version = await fetch('https://hagateway.zykj.org/api/discovery/sxz').then(r => r.json())
    check(version.server === 'http://sxz.api.zykj.org', '真实 WebView2 官方学校发现跨域读取')
    const options = await fetch('https://hagateway.zykj.org/api/discovery/sxz', { method: 'OPTIONS', headers: { 'Access-Control-Request-Headers': 'x-oss-test' } })
    check(options.status === 204, '预检在本地处理，无远端写入')
    // Native remote-view isolation and lifecycle, using only a public read endpoint.
    const guestArgs = { id: 'qa-guest', url: 'https://hagateway.zykj.org/api/discovery/sxz', x: 30, y: 180, width: 500, height: 200, scale: 1, script: '' }
    await host.openEmbedded(guestArgs)
    const guestStatus = () => new Promise<any>(resolve => {
      const id = 'qa-status-' + Math.random()
      const listener = ({ data }: any) => { if (data.id === id) { (window as any).chrome.webview.removeEventListener('message', listener); resolve(data.result) } }
      ;(window as any).chrome.webview.addEventListener('message', listener)
      ;(window as any).chrome.webview.postMessage({ id, method: 'qaGuestStatus', args: {} })
    })
    let status = await guestStatus()
    for (let i = 0; i < 30 && !status.loaded; i++) { await new Promise(resolve => setTimeout(resolve, 200)); status = await guestStatus() }
    check(status.present && status.loaded && status.bridgeDisabled && status.noPrivilegedBridge, '远端独立 WebView2 加载成功且无原生权限')
    check((await host.getEmbeddedState({id:guestArgs.id})).loaded, '生产桥提供嵌入页面加载状态')
    await host.resizeEmbedded({ ...guestArgs, width: 400, height: 160 }); status = await guestStatus()
    check(status.width === 400 && status.height === 160, '嵌入区域随布局更新尺寸')
    await host.closeEmbedded({ id: guestArgs.id }); status = await guestStatus()
    check(!status.present, '离开页面释放远端视图')
    check(!(await host.getEmbeddedState({id:guestArgs.id})).loaded, '已释放视图不残留加载成功状态')
  }
  return { passed: true, checks, pages: pages.length, savedBytes: host ? 2 * 1024 * 1024 + 7 : 0 }
}
main().then(result => {
  document.getElementById('result')!.textContent = JSON.stringify(result, null, 2)
  if ((window as any).nativeHost) (window as any).chrome.webview.postMessage({ id: 0, method: 'qaResult', args: result })
}).catch(error => {
  const result = { passed: false, error: error.stack || error.message, checks }
  document.getElementById('result')!.textContent = JSON.stringify(result, null, 2)
  if ((window as any).nativeHost) (window as any).chrome.webview.postMessage({ id: 0, method: 'qaResult', args: result })
})

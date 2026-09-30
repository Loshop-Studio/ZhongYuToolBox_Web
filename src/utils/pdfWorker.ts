/**
 * 加载 pdfjs-dist（统一封装 worker 初始化，供 pdf.ts / LessonViewerView 复用）。
 *
 * 背景：项目原先在页面里用
 *   new Worker(相对资源URL, { type: 'module' })
 * 创建解析 worker。该写法在浏览器 / Electron / 5+ 调试基座下正常；但正式打包后，
 * 页面以 file://（APK 内 assets）加载，WebView 无法创建该 module worker，worker 永远
 * 不就绪，pdfjs 的 getDocument 会一直挂起 —— 表现为卡在“转换PDF 0/1”。
 *
 * 对策：5+（App）下导入 worker 模块。该模块在导入时会自动把 WorkerMessageHandler
 * 挂到 globalThis.pdfjsWorker；pdfjs 检测到后直接改用「主线程伪 worker」，
 * 不再创建 Worker、也不依赖 workerSrc，打包前后行为一致、稳定可用。
 * 非 5+（浏览器 / Electron）继续使用真正的 worker 以获得更好性能。
 */
import { isPlus } from '@/utils/plusPicker'

let loading: Promise<any> | null = null

export function loadPdfjs(): Promise<any> {
  if (loading) return loading
  loading = (async () => {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
    if (isPlus) {
      // @ts-ignore 该子路径无类型声明；导入即注入 globalThis.pdfjsWorker（触发主线程伪 worker）
      await import('pdfjs-dist/build/pdf.worker.min.mjs')
    } else if (!pdfjs.GlobalWorkerOptions.workerPort) {
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: 'module' })
    }
    return pdfjs
  })()
  return loading
}

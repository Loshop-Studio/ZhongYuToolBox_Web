import EzyBoardViewer from './EzyBoardViewer.vue'
import { openSource, convert, detect, loadRec, exportMp4, mergeSvgs, MP4_QUALITY } from './core/board.js'
import { writeZip } from './core/writer.js'

EzyBoardViewer.install = app => { app.component('EzyBoardViewer', EzyBoardViewer) }

/** 不挂载组件：每页一个 SVG 字符串（图片 base64 内联）。source 同组件。 */
export async function boardToSvgs(source, options = {}) {
  const z = await openSource(source, options.fetchOptions)
  return (await convert(z)).map(r => (r.err ? { error: r.err } : { svg: r.svg }))
}
/** 不挂载组件：导出 SVG Blob（多页纵向合并为一个） */
export async function boardToSvgBlob(source, options = {}) {
  const z = await openSource(source, options.fetchOptions)
  return new Blob([mergeSvgs(await convert(z))], { type: 'image/svg+xml' })
}
/** 不挂载组件：导出 MP4 Blob（仅录制；需要浏览器 WebCodecs）。options: { quality: 'low'|'mid'|'high'|{long,kbps}, onProgress(stage, frac), signal, force } */
export async function boardToMp4Blob(source, options = {}) {
  const z = await openSource(source, options.fetchOptions)
  if (!options.force && !(await detect(z)).length) throw Error('这是静态内容，没有可导出的 MP4（需要录制内容；或传 force: true 按命令回放导出）')
  const R = await loadRec(z)
  try {
    const q = options.quality && typeof options.quality === 'object' ? { key: 'custom', ...options.quality } : MP4_QUALITY[options.quality || 'mid']
    if (!q) throw Error('未知画质：' + options.quality)
    return await exportMp4(R, q, options.onProgress, options.signal)
  } finally { R.clips.forEach(c => URL.revokeObjectURL(c.url)) }
}
/** [{ path, blob }] → zip Blob */
export async function filesToZip(files) {
  const z = await openSource(files)
  return writeZip(await Promise.all(z.names.map(async name => ({ name, data: await z.read(name) }))))
}

export { createBoard, parseColor, GRAPH, CMD } from './core/builder.js'
export { MP4_QUALITY, EzyBoardViewer }
export default EzyBoardViewer

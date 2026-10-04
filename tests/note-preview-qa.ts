import { createBoard, noteToSvgs, inspectNote } from 'ezy-board-viewer'
import { PDFDocument } from 'pdf-lib'
import { collectNoteResources } from '../src/utils/noteResourceModel'
import { createNoteVfs } from '../src/utils/noteVfs'
import { buildNotePdf } from '../src/utils/notePdf'

export async function notePreviewQa(check: (ok: boolean, name: string) => void) {
  const board = createBoard({ width: 640, height: 360, screenshot: false })
  board.page().text('中文矢量笔记 · 数学', { x: 28, y: 35, size: 28 })
  board.page().stroke([[10,100],[180,140],[620,150]], { lineWidth: 5, color: '#705776' })
  board.addPage({ width: 360, height: 640 }).text('第三页', { x: 24, y: 45, size: 24 })
  const files = await board.toFiles(), paths = [...new Set(files.filter(f => f.path.endsWith('snapshot.bin')).map(f => f.path.split('/')[0]))]
  const bytes = new Map<string, Blob>(), counts = new Map<string, number>()
  const resources: any[] = []
  files.forEach(file => {
    const index = paths.indexOf(file.path.split('/')[0]); if (index < 0) return
    const url = 'https://fixture.invalid/' + file.path + '?signature=QA'
    bytes.set(url, file.blob)
    resources.push({ pageIndex: index * 2, resourceType: 1, ossImageUrl: url })
  })
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 450
  const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0,0,720,450)
  context.fillStyle = '#705776'; context.fillRect(0,0,35,35); context.fillRect(685,415,35,35)
  context.font = '32px sans-serif'; context.fillText('截图页面 2', 60, 80)
  const screenshot = canvas.toDataURL('image/png')
  resources.push({ pageIndex: 1, resourceType: 2, ossImageUrl: screenshot })
  // Metadata extension matching uses URL pathname; data URLs are used only for the PDF fixture below.
  resources[resources.length - 1].ossImageUrl = 'https://fixture.invalid/page2.png?signature=QA'
  const data = collectNoteResources(resources)
  check(data.pages.join(',') === '1,2,3', '笔记混合矢量/截图页面全部保留且排序正确')
  check(data.boards.map(p => p.pageKey).join(',') === '1,3' && data.pageMap[2].thumbnail != null, '带签名参数的截图和画板资源均可识别')
  const source = await createNoteVfs({ pages: data.boards, fetchBlob: async url => {
    counts.set(url, (counts.get(url) || 0) + 1)
    const blob = bytes.get(url); if (!blob) throw Error('未知测试资源 ' + url); return blob
  } })
  check((await inspectNote(source)).pageDirs.length === 2, 'npm 笔记查看器识别 VFS 两页')
  const vector = await noteToSvgs(source)
  check(vector.length === 2 && vector.every(p => !!p.svg && !p.error), '旧格式文字/笔迹及附属 bin 完整矢量还原')
  check(vector[0].svg!.includes('中文矢量笔记') && vector[1].svg!.includes('第三页'), '矢量文字与原始页序一致')
  await noteToSvgs(source)
  check([...counts.values()].every(n => n === 1), '同一笔记二次渲染复用下载字节')
  const mdbUrl = 'https://fixture.invalid/data.mdb', touchUrl = 'https://fixture.invalid/pen_touch.bin?signature=QA'
  let mdbReads = 0, touchReads = 0
  const newer = await createNoteVfs({ pages: [{ pageKey: 1, snapshotUrl: 'snapshot', mdbUrl, touchUrls: [touchUrl] }], fetchBlob: async url => {
    if (url === mdbUrl) mdbReads++; if (url === touchUrl) touchReads++
    return new Blob([new Uint8Array(16)])
  } })
  await Promise.all([newer.read('1/header.bin'), newer.read('1/page_mdb/data.mdb')])
  await newer.read('1/pen_touch.bin')
  check(mdbReads === 1 && touchReads === 1, 'MDB 配置/笔迹共用下载且带签名笔触可读取')
  let attempts = 0
  const retry = await createNoteVfs({ pages: [{ pageKey: 1, snapshotUrl: 'retry' }], fetchBlob: async () => { if (!attempts++) throw Error('temporary'); return new Blob(['ok']) } })
  try { await retry.read('1/snapshot.bin') } catch { /* expected first download failure */ }
  check(new TextDecoder().decode((await retry.read('1/snapshot.bin'))!) === 'ok', '临时资源失败后可重试')
  const result = await buildNotePdf([{ key:1, svg:vector[0].svg }, { key:2, thumbnail:screenshot }, { key:3, svg:vector[1].svg }])
  check((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount() === 3 && result.fallbackPages.join(',') === '2', '笔记 PDF 三页齐全且仅截图页回退')
  const fallback = await buildNotePdf([{ key:7, svg:'<svg xmlns="http://www.w3.org/2000/svg"/>', thumbnail:screenshot }])
  check(fallback.fallbackPages[0] === 7, '无有效矢量图元时导出截图')
  let failed = false
  try { await buildNotePdf([{ key:9 }]) } catch (error) { failed = String(error).includes('第 9 页') }
  check(failed, '缺失页明确停止导出，不静默漏页')
  const abort = new AbortController(); abort.abort(); failed = false
  try { await buildNotePdf([{ key:1, svg:vector[0].svg }], { signal:abort.signal }) } catch(error) { failed = (error as Error).name === 'AbortError' }
  check(failed, '取消笔记导出不生成文件')
  return result.blob
}

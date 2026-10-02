import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { PDFDocument, degrees, rgb } from 'pdf-lib'

const output = resolve('.test-output')
const {readNoteTemplate} = createRequire(import.meta.url)('../electron/noteTemplates.cjs')
assert.equal(readNoteTemplate(resolve('public/example'), 'page_router.bin').length,40)
for (const name of ['../../package.json', '/etc/passwd', 'res/image/random.webp']) assert.throws(()=>readNoteTemplate(resolve('public/example'),name))
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/utils/pdfLandscape.ts'], outfile: output + '/landscape.mjs', bundle: true, platform: 'node', format: 'esm' })
await build({entryPoints:['src/utils/noteCanvas.ts'],outfile:output+'/canvas.mjs',bundle:true,platform:'node',format:'esm'})
const {NOTE_CANVAS,fitPageToCanvas}=await import(pathToFileURL(output+'/canvas.mjs'))
for(const [w,h] of [[595,842],[842,595],[500,500],[3000,300],[300,3000]]) {const f=fitPageToCanvas(w,h,NOTE_CANVAS);assert.ok(f.x>=0&&f.y>=0);assert.ok(f.x+w*f.scale<=2880+1e-6);assert.ok(f.y+h*f.scale<=1800+1e-6)}
assert.throws(()=>fitPageToCanvas(0,100,NOTE_CANVAS))
const { prepareLandscapePdf } = await import(pathToFileURL(output + '/landscape.mjs'))
const document = await PDFDocument.create()
const definitions = [[400, 600, 0], [600, 400, 0], [600, 400, 90], [400, 600, 90], [500, 500, 0], [595, 842, 0], [2000, 300, 0], [300, 2000, 0]]
for (const [index, [width, height, rotation]] of definitions.entries()) {
  const page = document.addPage([width, height])
  page.setRotation(degrees(rotation))
  for(const [x,y] of [[4,4],[width-20,4],[4,height-20],[width-20,height-20]])page.drawRectangle({x,y,width:16,height:16,color:rgb(0,0.6,0.2)})
  page.drawText(`PAGE ${index + 1}`, { x: 30, y: height - 60, size: 32 })
  page.drawRectangle({ x: 30, y: height - 140, width: 80, height: 50, color: rgb(1, 0, 0) })
}
const inputBytes = await document.save()
const input = new File([inputBytes], 'mixed.pdf', {type: 'application/pdf'})
const result = await prepareLandscapePdf(input)
assert.deepEqual(result.rotatedPages, [1, 3, 6, 8])
assert.equal(result.totalPages, 8)
assert.deepEqual(new Uint8Array(await input.arrayBuffer()), inputBytes, 'input must remain unchanged')
const converted = await PDFDocument.load(await result.file.arrayBuffer())
assert.deepEqual(converted.getPages().map(page => page.getRotation().angle), [270, 0, 0, 90, 0, 270, 0, 270])
assert.deepEqual(converted.getPages().map(page => page.getSize()), definitions.map(([width,height]) => ({width,height})))
for (const page of converted.getPages()) {
  const box = page.getCropBox(), sideways = [90,270].includes(page.getRotation().angle)
  assert.ok((sideways ? box.height : box.width) >= (sideways ? box.width : box.height))
  assert.ok(page.node.Contents(), 'vector content remains present')
}
assert.equal((await prepareLandscapePdf(result.file)).file, result.file, 'already landscape: no rewrite')
await assert.rejects(() => prepareLandscapePdf(new File(['invalid'], 'invalid.pdf')))
await writeFile(output + '/mixed.pdf', inputBytes)
await writeFile(output + '/mixed-landscape.pdf', new Uint8Array(await result.file.arrayBuffer()))

const mocks = {
  '@/config': 'export const PLATFORM = "webview2"; export const IS_WINDOWS = true; export const IS_AOKI = true;',
  '@/utils/plusPicker': 'export const isPlus = false;',
  '@/utils/crypto': 'export const aesEncrypt = value => value;',
  '@/utils/pdf': `import {createHash} from 'node:crypto'; export const blobToMd5 = async blob => createHash('md5').update(Buffer.from(await blob.arrayBuffer())).digest('hex').toUpperCase(); export async function convertPdfToImages(file, progress, options) { return globalThis.renderPages(file, options); }`,
  '@/utils/oss': `export async function uploadFile(blob, userId, fc, fileId, filename) { const url = 'https://actual-bucket.oss-cn-hangzhou.aliyuncs.com/note_v2/res/'+userId+'/20990101/'+fileId+'/'+filename; globalThis.uploads.push({blob, url, filename}); return url; }`
}
await build({ entryPoints: ['src/api/pdfNote.ts'], outfile: output + '/upload.mjs', bundle: true, platform: 'node', format: 'esm', plugins: [{name:'offline-test-mocks', setup(builder) {
  builder.onResolve({filter:/^@\//}, args => mocks[args.path] ? {path:args.path, namespace:'mock'} : {path:resolve('src',args.path.slice(2)+'.ts')})
  builder.onLoad({filter:/.*/, namespace:'mock'}, args => ({contents:mocks[args.path],loader:'js'}))
}}] })
const payload = Buffer.from(JSON.stringify({sub:'TEST_ONLY',exp:Math.floor(Date.now()/1000)+3600})).toString('base64')
globalThis.window = {}
globalThis.localStorage = {getItem: key => key === 'token' ? 'test.'+payload+'.test' : null}
let saves = [], failTemplate = true
globalThis.uploads = []
globalThis.fetch = async (url, options) => {
  if (!options) {
    if (failTemplate && url.endsWith('/header.bin')) { failTemplate=false; throw new Error('TEST template failure') }
    return new Response(await readFile('public/'+url))
  }
  saves.push({url,body:JSON.parse(options.body)})
  return new Response(JSON.stringify({code:0}), {headers:{'Content-Type':'application/json'}})
}
globalThis.renderPages = async (file, options) => {
  const inspected = await PDFDocument.load(await file.arrayBuffer())
  assert.equal(inspected.getPage(0).getRotation().angle, 270, 'rotate before upload rendering')
  assert.equal(globalThis.uploads.length, 0, 'no remote upload before local preparation/rendering')
  assert.equal(options.type, 'image/webp'); assert.deepEqual(options.canvasSize,{width:2880,height:1800})
  for (let i=0; i<2; i++) await options.onPage({pageNum:i+1,blob:new Blob(['TEST_IMAGE_'+i],{type:'image/webp'}),url:''},i,2)
  return []
}
const {uploadPdfAsNote} = await import(pathToFileURL(output + '/upload.mjs'))
await assert.rejects(() => uploadPdfAsNote({file:input,noteName:'TEST_ONLY'}), /template failure/)
assert.equal(uploads.length,0)
const progress=[]
await uploadPdfAsNote({file:input,noteName:'TEST_ONLY',onProgress:p=>progress.push(p)})
assert.equal(uploads.length,18)
const resources = saves[0].body
assert.equal(resources.length,18)
for (const resource of resources) {
  const upload = uploads.find(item => item.url === resource.ossImageUrl)
  assert.ok(upload)
  assert.equal(resource.md5,createHash('md5').update(Buffer.from(await upload.blob.arrayBuffer())).digest('hex').toUpperCase())
  if (resource.id.includes('/res/image/')) assert.equal(resource.resourceType,0)
}
for (let page=0;page<2;page++) {
  const items=uploads.slice(page*9,(page+1)*9)
  const image=items[8], descriptor=items.find(item=>item.filename.endsWith('_file.bin')), router=items.find(item=>item.filename.endsWith('/router.bin'))
  assert.match(await descriptor.blob.text(), new RegExp(createHash('sha256').update(Buffer.from(await image.blob.arrayBuffer())).digest('hex')))
  assert.match(await router.blob.text(), new RegExp(createHash('sha256').update(Buffer.from(await descriptor.blob.arrayBuffer())).digest('hex')))
  assert.equal(descriptor.blob.size,157)
  assert.equal(items[0].blob.size,40)
}
assert.ok(saves[1].body.fileUrl.startsWith('https://actual-bucket.'))
assert.ok(progress.every((value,index)=>!index || value>=progress[index-1]))
assert.equal(progress.at(-1),100)
uploads=[]; saves=[]
await uploadPdfAsNote({file:input,noteName:'TEST_REPEAT',images:[{pageNum:1,blob:new Blob(['TEST_REPEAT'],{type:'image/webp'}),url:''}]})
assert.equal(uploads.length,9, 'cached templates remain complete on repeated upload')
const stableId = 'h' + 'g' + '0'.repeat(31)
for (let attempt=0;attempt<2;attempt++) {
  uploads=[]; saves=[]
  await uploadPdfAsNote({file:input,noteName:'STABLE_RETRY',fileId:stableId,images:[{pageNum:1,blob:new Blob(['TEST_RETRY'],{type:'image/webp'}),url:''}]})
  assert.equal(saves[1].body.fileId,stableId, 'batch retry reuses the same note identity')
}
await assert.rejects(()=>uploadPdfAsNote({file:input,noteName:'BAD_ID',fileId:'../../invalid',images:[{pageNum:1,blob:new Blob(['TEST']),url:''}]}),/文件 ID/)
console.log('PASS: portrait/landscape/pre-rotated/square pages, original preserved, invalid PDF rejected; offline upload hashes, SHA chains, actual URLs, monotonic progress, retry and repeated upload. No real network requests.')

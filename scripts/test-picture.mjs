import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const output = resolve('.test-output/picture.mjs')
await build({ entryPoints: ['src/api/picture.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', plugins: [{
  name: 'gallery-contract', setup(b) {
    b.onResolve({ filter: /^@\/utils\/(request|localData)$/ }, args => ({ path: args.path, namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: args.path.endsWith('request') ? 'export const request=(...args)=>globalThis.galleryRequest(...args)' : 'export const accountKey=()=>globalThis.galleryAccount' }))
  }
}] })
const { movePicturesToRecycleBin, recoverPictures, deleteRecycledPictures } = await import(pathToFileURL(output))
globalThis.galleryAccount = 'school|student'
const calls = []
let fail = false, switchAccount = false
globalThis.galleryRequest = async (url, options) => {
  calls.push({ url, ...options })
  if (options.method === 'GET') {
    if (switchAccount) globalThis.galleryAccount = 'school|other'
    const query = new URL(url, 'http://test').searchParams
    const recycled = query.get('IsRecycleBin') === 'true', skip = +query.get('SkipCount')
    return { result: { items: skip ? [{ id: 203 }] : [{ id: recycled ? 101 : 201 }, { id: recycled ? 102 : 202 }], totalCount: 3 } }
  }
  if (fail) throw Error('official rejection')
  return { success: true, result: null }
}
try {
  await deleteRecycledPictures([101, '102', 101])
  assert.equal(calls.at(-1).method, 'DELETE'); assert.equal(calls.at(-1).body, undefined)
  assert.deepEqual(new URL(calls.at(-1).url, 'http://test').searchParams.getAll('ids'), ['101', '102'])
  assert.ok(calls.at(-1).url.startsWith('/api/services/app/PictureLibrary/DeletePicture?'))
  await movePicturesToRecycleBin([201, 203]); assert.equal(calls.at(-1).body, '[201,203]'); assert.ok(calls.at(-1).url.endsWith('MoveToRecycleBinAsync'))
  await recoverPictures([101]); assert.equal(calls.at(-1).body, '[101]'); assert.ok(calls.at(-1).url.endsWith('RecoverPictureFromRecycleBinAsync'))
  let writes = calls.filter(c => c.method !== 'GET').length
  await assert.rejects(deleteRecycledPictures([201]), /不在回收站/)
  assert.equal(calls.filter(c => c.method !== 'GET').length, writes)
  for (const ids of [[], ['NaN'], [-1], ['9007199254740993'], Array.from({ length: 201 }, (_, i) => i + 1)]) await assert.rejects(deleteRecycledPictures(ids))
  const c = new AbortController(); c.abort(); const count = calls.length
  await assert.rejects(deleteRecycledPictures([101], c.signal), /取消/); assert.equal(calls.length, count)
  switchAccount = true; await assert.rejects(deleteRecycledPictures([101]), /账号/)
  assert.equal(calls.filter(c => c.method !== 'GET').length, writes)
  switchAccount = false; fail = true
  await assert.rejects(deleteRecycledPictures([101]), /official rejection/)
  console.log('PASS: gallery DELETE repeated ids/no body, POST arrays, pagination, deduplication, membership, invalid IDs, cancellation, account switch and server rejection.')
} finally { delete globalThis.galleryAccount; delete globalThis.galleryRequest }

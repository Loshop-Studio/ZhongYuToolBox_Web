import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import JSZip from 'jszip'

await mkdir('.test-output', { recursive: true })
const output = resolve('.test-output/app-downloads.mjs')
await build({ entryPoints: ['src/api/appStore.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', plugins: [{
  name: 'public-update-contract', setup(builder) {
    builder.onResolve({ filter: /^@\/utils\/request$/ }, () => ({ path: 'request', namespace: 'mock' }))
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js', contents: 'export const request = (...args) => globalThis.testAppRequest(...args)' }))
  }
}] })
const { getStudentApp, downloadOfficialApk, officialResourceUrl, appFilename } = await import(pathToFileURL(output))
const base = 'http://sxz.api.zykj.org'
const pkg = 'com.zhongyukejiao.learningexpert'
const zip = new JSZip()
zip.file('AndroidManifest.xml', 'synthetic test manifest'); zip.file('classes.dex', new Uint8Array(180000))
const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
const metadata = { name: '优课畅学', packageName: pkg, appType: 0, versionName: 'test', versionCode: 1, size: bytes.length, disabled: false, fileUrl: 'http://sxz.alicdn.zykj.org/test.apk' }
globalThis.testAppRequest = async (url, options) => {
  assert.equal(options.skipAuth, true); assert.equal(options.skipRecover, true); assert.equal(options.credentials, 'omit'); assert.equal(options.baseUrl, base)
  const query = new URL(base + url).searchParams
  assert.equal(query.get('appType'), '0'); assert.equal(query.get('version'), '0'); assert.equal(query.get('packageName'), pkg)
  return { result: metadata }
}
const originalFetch = globalThis.fetch
try {
  const app = await getStudentApp(pkg, base)
  assert.ok(app); assert.ok(appFilename(app).endsWith('.apk'))
  metadata.disabled = true; assert.equal(await getStudentApp(pkg, base), null); metadata.disabled = false
  metadata.appType = 1; await assert.rejects(getStudentApp(pkg, base), /类型不匹配/); metadata.appType = 0
  metadata.packageName = 'com.other.app'; await assert.rejects(getStudentApp(pkg, base), /包名/); metadata.packageName = pkg
  await assert.rejects(getStudentApp('../bad', base), /包名/)
  for (const url of ['file:///c:/a.apk', 'https://evil.example/a.apk', 'http://sxz.alicdn.zykj.org.evil.example/a.apk', 'https://user@ sxz.alicdn.zykj.org/a.apk', 'http://sxz.alicdn.zykj.org:8080/a.apk']) assert.throws(() => officialResourceUrl(url))
  assert.ok(officialResourceUrl('https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/test.apk'))
  const makeResponse = data => new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < data.length; i += 32768) controller.enqueue(data.slice(i, i + 32768))
    controller.close()
  } }))
  globalThis.fetch = async (url, options) => {
    assert.equal(url, app.fileUrl); assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined)
    return makeResponse(bytes)
  }
  const progress = []
  const result = await downloadOfficialApk(app, new AbortController().signal, (n, total) => { assert.equal(total, bytes.length); progress.push(n) })
  assert.equal(result.blob.size, bytes.length)
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(progress[0], 0); assert.equal(progress.at(-1), bytes.length)
  assert.ok(progress.every((n, i) => !i || n >= progress[i - 1]))
  globalThis.fetch = async () => makeResponse(bytes.slice(0, -1))
  await assert.rejects(downloadOfficialApk(app, new AbortController().signal, () => {}), /不完整/)
  globalThis.fetch = async () => makeResponse(new Uint8Array(bytes.length + 1))
  await assert.rejects(downloadOfficialApk(app, new AbortController().signal, () => {}), /超出/)
  globalThis.fetch = async () => new Response('<html>not an apk</html>')
  await assert.rejects(downloadOfficialApk({ ...app, size: 23 }, new AbortController().signal, () => {}))
  const plainZip = new JSZip(); plainZip.file('picture.png', 'not apk')
  const plain = await plainZip.generateAsync({ type: 'uint8array' })
  globalThis.fetch = async () => makeResponse(plain)
  await assert.rejects(downloadOfficialApk({ ...app, size: plain.length }, new AbortController().signal, () => {}), /有效的 Android APK/)
  globalThis.fetch = async () => makeResponse(bytes)
  const cancel = new AbortController()
  await assert.rejects(downloadOfficialApk(app, cancel.signal, n => { if (n) cancel.abort() }), { name: 'AbortError' })
  // Optional verification of a previously downloaded official binary; no account credentials.
  if (process.argv.includes('--official')) {
    const path = resolve('.local/research-1.1.4/learningexpert-student.apk')
    const binary = new Uint8Array(await readFile(path))
    globalThis.fetch = async () => makeResponse(binary)
    const verified = await downloadOfficialApk({ ...app, size: 70127973 }, new AbortController().signal, () => {})
    assert.equal(verified.sha256, '82cbb938b320313add4b7e1d3dab60d82eb536b8f45184698d30dcd85011fe6e')
    console.log('Official learningexpert APK: exact size, structure and SHA-256 verified.')
  }
  console.log('PASS: student update contract, no credentials, metadata mismatch, URL validation, streaming progress, SHA-256, truncation/oversize/invalid APK rejection and cancellation.')
} finally { globalThis.fetch = originalFetch; delete globalThis.testAppRequest }

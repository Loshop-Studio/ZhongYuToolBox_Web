import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const source = await readFile('src/config/index.ts', 'utf8')
assert.match(source, /const AUTHOR_STATS_DEFAULT = true/)
assert.match(await readFile('.env.ios', 'utf8'), /^VITE_AUTHOR_STATS=true$/m)
assert.match(await readFile('src/stores/auth.ts', 'utf8'), /void reportLogin\(effectiveSchool, account\)/)
const windows = await readFile('native-windows/Program.cs', 'utf8')
assert.match(windows, /e.Request.Uri == "https:\/\/tbapi.loshop.com.cn\/api\/login"/)
assert.match(windows, /sender == main.CoreWebView2 && IsTrusted/)
const android = await readFile('native-android/app/src/main/java/com/aoki/zhongyutoolbox/MainActivity.java', 'utf8')
assert.match(android, /authorStats=privileged&&"POST".equals\(method\)&&"https:\/\/tbapi.loshop.com.cn\/api\/login".equals\(current\)/)
const original = globalThis.fetch
let calls = 0, reject = false
try {
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(url, 'https://tbapi.loshop.com.cn/api/login')
    assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'omit')
    assert.deepEqual(JSON.parse(options.body), { school: 'TEST_SCHOOL', username: 'TEST_USER', deviceId: '' })
    if (reject) throw Error('server down')
    return new Response('', { status: 403 })
  }
  for (const enabled of [false, true]) {
    const outfile = resolve(`.test-output/stats-${enabled}.mjs`)
    await build({ entryPoints: ['src/utils/track.ts'], outfile, bundle: true, platform: 'node', format: 'esm', plugins: [{
      name: 'stats-build-flag', setup(b) {
        b.onResolve({ filter: /^@\/config$/ }, () => ({ path: 'config', namespace: 'test' }))
        b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: `export const AUTHOR_STATS_ENABLED=${enabled};export const TRACK_API='https://tbapi.loshop.com.cn/api'` }))
      }
    }] })
    const { reportLogin } = await import(pathToFileURL(outfile))
    const before = calls
    await reportLogin('TEST_SCHOOL', 'TEST_USER'); assert.equal(calls - before, enabled ? 1 : 0)
    await reportLogin('', 'TEST_USER'); assert.equal(calls - before, enabled ? 1 : 0)
    reject = true; await reportLogin('TEST_SCHOOL', 'TEST_USER'); reject = false
  }
  console.log('PASS: author statistics enabled by default; original login-count contract preserved; explicit disabled test has no requests; no credential headers; 403/network failure do not block login.')
} finally { globalThis.fetch = original }

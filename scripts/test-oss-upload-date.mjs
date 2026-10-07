import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Simulate the server's Beijing-day resource policy, independent of the helper.
const RealDate = Date, originalFetch = globalThis.fetch, originalTZ = process.env.TZ
let clock = RealDate.parse('2026-10-06T16:07:00Z'), delay = 0, includeDate = true
let grants = 0, puts = 0
const policies = new Map()
function beijingDay(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new RealDate(timestamp))
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('')
}
class TestDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])) }
  static now() { return clock }
}
const bytes = Uint8Array.from([0, 1, 2, 127, 128, 255])
const file = new File([bytes], 'test.bin', { type: 'application/octet-stream' })
async function validatePut(key, token, body) {
  const policy = policies.get(token)
  assert.ok(policy, 'Unknown grant')
  if (!key.startsWith(policy.prefix)) throw Error('403 AccessDenied: Access denied by authorizer\'s policy')
  assert.deepEqual(new Uint8Array(await body.arrayBuffer()), bytes)
  puts++
  return { url: 'https://actual-school.oss-cn-hangzhou.aliyuncs.com/' + key }
}
globalThis.__ossDateRequest = async (path, options) => {
  assert.equal(path, '/api/services/app/ObjectStorage/GenerateTokenV2Async')
  assert.equal(options.raw, true)
  const body = JSON.parse(options.body)
  assert.equal(body.ts, clock)
  assert.equal(body.fc, 1)
  clock += delay
  const token = 'MOCK_GRANT_' + (++grants)
  policies.set(token, { prefix: `note_v2/res/TEST_USER/${beijingDay(clock)}/${body.nonce}/` })
  return new Response(JSON.stringify({ success: true, result: {
    region: 'oss-cn-hangzhou', bucket: 'actual-school', endpoint: 'http://actual-school.oss-cn-hangzhou.aliyuncs.com',
    accessKeyId: 'TEST_ONLY_ID', accessKeySecret: 'TEST_ONLY_SECRET', securityToken: token,
    expiration: new RealDate(clock + 3600000).toISOString()
  } }), { headers: includeDate ? { Date: new RealDate(clock).toUTCString() } : {} })
}
globalThis.__ossDateSdk = async (key, config, body) => {
  assert.equal(config.secure, true)
  assert.equal(config.bucket, 'actual-school')
  return validatePut(key, config.stsToken, body)
}
globalThis.fetch = async (url, options) => {
  const headers = new Headers(options.headers), date = headers.get('date')
  assert.equal(date, new RealDate(clock).toUTCString(), 'OSS signing Date must remain GMT')
  const canonical = ['PUT', '', file.type, date, 'x-oss-security-token:' + headers.get('x-oss-security-token'), '/actual-school' + new URL(url).pathname].join('\n')
  assert.equal(headers.get('authorization'), 'OSS TEST_ONLY_ID:' + createHmac('sha1', 'TEST_ONLY_SECRET').update(canonical).digest('base64'))
  assert.equal(new URL(url).protocol, 'https:')
  await validatePut(new URL(url).pathname.slice(1), headers.get('x-oss-security-token'), options.body)
  return new Response('', { status: 200 })
}
globalThis.Date = TestDate
await mkdir('.test-output', { recursive: true })
try {
  for (const platform of ['android', 'ios', 'webview2', 'plus', 'browser']) {
    const outfile = `.test-output/oss-date-${platform}.mjs`
    await build({ entryPoints: ['src/utils/oss.ts'], outfile, bundle: true, format: 'esm', platform: 'node', external: ['crypto-js'], plugins: [{ name: 'oss-policy-mock', setup(b) {
      b.onResolve({ filter: /^(ali-oss|@\/config|@\/utils\/request)$/ }, args => ({ path: args.path, namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'ali-oss'
        ? 'export default class OSS { constructor(config) { this.config=config } put(key,body) { return globalThis.__ossDateSdk(key,this.config,body) } }'
        : args.path === '@/config' ? `export const PLATFORM=${JSON.stringify(platform)}`
        : 'export const request=(...args)=>globalThis.__ossDateRequest(...args)', loader: 'js' }))
    } }] })
    const { createOssUploadSession, uploadFile } = await import(pathToFileURL(resolve(outfile)))
    for (const tz of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
      process.env.TZ = tz
      for (const time of ['2026-10-06T15:59:59Z', '2026-10-06T16:00:00Z', '2026-10-06T16:07:00Z', '2026-10-06T23:59:59Z', '2026-10-07T00:00:00Z', '2024-02-28T16:00:00Z', '2026-12-31T16:00:00Z']) {
        clock = RealDate.parse(time)
        const result = await uploadFile(file, 'TEST_USER', 'note_v2', 'NONCE', 'folder/test.bin')
        assert.equal(result, `https://actual-school.oss-cn-hangzhou.aliyuncs.com/note_v2/res/TEST_USER/${beijingDay(clock)}/NONCE/folder/test.bin`)
      }
    }
    clock = RealDate.parse('2026-10-06T15:59:59Z')
    const before = grants, session = await createOssUploadSession('TEST_USER', 'note_v2', 'CROSS_MIDNIGHT')
    await session.upload(file, 'page1/test.bin')
    clock = RealDate.parse('2026-10-06T16:07:00Z')
    const afterMidnight = await session.upload(file, 'page2/test.bin')
    assert.equal(session.dateStamp, '20261006')
    assert.ok(afterMidnight.includes('/20261006/CROSS_MIDNIGHT/'))
    assert.equal(grants, before + 1, 'One document must keep one grant and root')
    const newFile = await uploadFile(file, 'TEST_USER', 'note_v2', 'NEW_NOTE')
    assert.ok(newFile.includes('/20261007/NEW_NOTE/'))
    const priorPuts = puts
    clock = RealDate.parse('2026-10-06T17:00:00Z')
    await assert.rejects(session.upload(file, 'page3/test.bin'), /授权已过期/)
    assert.equal(puts, priorPuts)

    clock = RealDate.parse('2026-10-06T15:59:59Z'); delay = 2000
    const delayed = await createOssUploadSession('TEST_USER', 'note_v2', 'DELAYED')
    assert.equal(delayed.dateStamp, '20261007', 'Server Date wins when response crosses midnight')
    await delayed.upload(file)
    delay = 0; includeDate = false; clock = RealDate.parse('2026-10-06T16:07:00Z')
    const fallback = await createOssUploadSession('TEST_USER', 'note_v2', 'NO_DATE_HEADER')
    assert.equal(fallback.dateStamp, '20261007')
    await fallback.upload(file)
    includeDate = true
    await assert.rejects(validatePut('note_v2/res/TEST_USER/20261006/NO_DATE_HEADER/test.bin', 'MOCK_GRANT_' + grants, file), /authorizer's policy/)
    console.log(`PASS: ${platform}: Beijing midnight / 08:00 / leap day / new year, three device timezones, server clock, grant reuse, expiry, actual bucket and binary integrity.`)
  }
} finally {
  globalThis.Date = RealDate; globalThis.fetch = originalFetch
  if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ
  delete globalThis.__ossDateRequest; delete globalThis.__ossDateSdk
}
console.log(`PASS: ${grants} STS grants, ${puts} policy-checked uploads; UTC regression reproduced. Mock credentials only, no network or cloud writes.`)

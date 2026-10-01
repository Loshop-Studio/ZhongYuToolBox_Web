import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

// Load the production protocol constants without browser localStorage.
const config = await readFile('src/config/index.ts', 'utf8')
const constants = config.match(/export const LINSPIRER = (\{[\s\S]*?\n\})/)
assert.ok(constants, 'production Linspirer constants must be available')
const output = resolve('.test-output/linspirer.mjs')
await mkdir(resolve('.test-output'), { recursive: true })
await build({
  entryPoints: ['src/api/linspirer.ts'], outfile: output,
  bundle: true, platform: 'node', format: 'esm',
  plugins: [{ name: 'browser-config', setup(builder) {
    builder.onResolve({ filter: /^@\/config$/ }, () => ({ path: 'config', namespace: 'test' }))
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
      contents: `export const LINSPIRER = ${constants[1]}; export const generateAesKey = () => '0000000000000000';`,
      loader: 'js'
    }))
  }}]
})

const RealDate = Date
const realFetch = globalThis.fetch
const fixedDate = new RealDate(2026, 9, 1, 12)
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixedDate.getTime()])) }
  static now() { return fixedDate.getTime() }
}

try {
  const { calcAdminCode, calcPassword } = await import(pathToFileURL(output))
  const { default: CryptoJS } = await import('crypto-js')
  const protocol = Function(`return (${constants[1]})`)()
  const syntheticId = 'test-a1b2c3'
  const studentId = 'TEST_STUDENT'
  function referenceCode(sid = '') {
    const digest = createHash('md5').update('20261001' + syntheticId + protocol.FIXED_UUID + sid).digest('hex')
    const decimal = String(BigInt('0x' + digest.slice(-8))).slice(-8)
    return decimal.length >= 6 ? decimal.slice(0, 6) : 'unknown'
  }
  for (const sid of [undefined, studentId]) {
    const expected = referenceCode(sid)
    for (const input of [syntheticId, syntheticId.toUpperCase(), 'TeSt-A1b2C3', ' \tTEST-A1B2C3\n']) {
      assert.equal(calcAdminCode(input, sid), expected, 'case and outer whitespace must not affect the code')
    }
  }

  let requests = 0
  globalThis.fetch = async (url, options) => {
    requests++
    assert.equal(url, protocol.API)
    const envelope = JSON.parse(options.body)
    assert.equal(envelope.method, 'com.linspirer.user.getuserinfo')
    const params = JSON.parse(CryptoJS.AES.decrypt(envelope.params, CryptoJS.enc.Utf8.parse(protocol.KEY), {
      iv: CryptoJS.enc.Utf8.parse(protocol.IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7
    }).toString(CryptoJS.enc.Utf8))
    assert.equal(params.swdid, syntheticId, 'online lookup must use the normalized ID')
    assert.equal(params.email, 'TEST_ACCOUNT')
    assert.equal(params.model, 'TEST_MODEL')
    return new Response(JSON.stringify({ code: 0, data: { id: studentId } }))
  }
  assert.equal(await calcPassword(' TEST-A1B2C3 ', 'TEST_ACCOUNT', 'TEST_MODEL'), referenceCode(studentId))
  assert.equal(requests, 1)
  assert.equal(await calcPassword('TEST-A1B2C3', '', '', studentId), referenceCode(studentId))
  assert.equal(requests, 1, 'cached student ID must skip the request')
  for (const input of ['', '  ', 'unknown', ' UNKNOWN ']) {
    assert.equal(calcAdminCode(input), 'unknown')
    assert.equal(await calcPassword(input, '', ''), 'unknown')
  }
  assert.equal(requests, 1, 'missing device IDs must not trigger a request')
  globalThis.fetch = async () => { throw new Error('TEST offline') }
  assert.equal(await calcPassword(' TEST-A1B2C3 ', '', ''), referenceCode(), 'offline fallback must normalize the ID')
  console.log('Linspirer regression checks passed: case, whitespace, online lookup, cached ID, missing ID, offline fallback.')
} finally {
  globalThis.Date = RealDate
  globalThis.fetch = realFetch
}

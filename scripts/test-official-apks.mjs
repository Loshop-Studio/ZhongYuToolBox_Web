import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const outfile = resolve('.test-output/official-apks.mjs')
await build({ entryPoints: ['src/utils/officialApks.ts'], outfile, bundle: true, platform: 'node', format: 'esm', alias: { '@': resolve('src') } })
const { identifyOfficialApk } = await import(pathToFileURL(outfile))
await assert.rejects(identifyOfficialApk(new Uint8Array(5)), /不在已核实/)
if (process.argv.includes('--official')) {
  const inventory = JSON.parse(await readFile('.local/official-apks-20261002/inventory.json', 'utf8'))
  assert.equal(inventory.length, 7)
  for (const item of inventory) {
    const bytes = new Uint8Array(await readFile(item.file)), app = await identifyOfficialApk(bytes)
    assert.equal(app.packageName, item.packageName); assert.equal(app.versionName, item.versionName); assert.equal(app.sha256, item.sha256)
    bytes[0] ^= 1; await assert.rejects(identifyOfficialApk(bytes), /SHA-256/)
    console.log(`PASS official APK: ${app.name} ${app.versionName} ${app.packageName}`)
  }
}
console.log('PASS: unknown APK rejected; --official verifies all seven supplied binaries and tampering.')

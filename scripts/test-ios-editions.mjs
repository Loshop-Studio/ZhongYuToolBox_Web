import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
await mkdir('.test-output', { recursive: true })
await writeFile('.test-output/ios-edition-entry.ts', "export { APP_VERSION, AUTHOR_STATS_ENABLED } from '../src/config/index'; export { RELEASE_REPOSITORY } from '../src/config/edition';")
globalThis.window = { localStorage: { getItem: () => null, removeItem() {} } }
for (const upstream of [false, true]) {
 const repository = upstream ? 'Loshop-Studio/ZhongYuToolBox_Web' : 'nickfox395/ZhongYuToolBox_Web'
 const outfile = resolve(`.test-output/ios-edition-${upstream}.mjs`)
 await build({ entryPoints:['.test-output/ios-edition-entry.ts'], outfile, bundle:true, platform:'node', format:'esm', define:{'import.meta.env':JSON.stringify({VITE_IS_BROWSER:'false',VITE_PLATFORM:'ios',...(upstream?{VITE_AUTHOR_STATS:'true',VITE_RELEASE_REPOSITORY:repository}:{})})} })
 const edition=await import(pathToFileURL(outfile))
 assert.equal(edition.APP_VERSION,'1.1.14-ios-beta1')
 assert.equal(edition.RELEASE_REPOSITORY,repository)
 assert.equal(edition.AUTHOR_STATS_ENABLED,true)
}
console.log('PASS: Beta 1 labels, separate release/feedback repositories; author statistics enabled in both editions.')

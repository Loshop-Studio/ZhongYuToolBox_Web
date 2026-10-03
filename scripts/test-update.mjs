import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
await mkdir('.test-output',{recursive:true})
await build({entryPoints:['src/utils/appUpdate.ts'],outfile:'.test-output/app-update.mjs',bundle:true,platform:'node',format:'esm'})
const {compareVersions,fetchLatestRelease}=await import('../.test-output/app-update.mjs')
assert.equal(compareVersions('v1.1.13-aoki','1.1.12-aoki'),1)
assert.equal(compareVersions('1.1.9-aoki','v1.1.12-aoki'),-1)
assert.equal(compareVersions('v1.1.12-aoki','1.1.12-aoki'),0)
assert.equal(compareVersions('v0.0.7 patch1','0.0.7'),1)
assert.equal(compareVersions('preview','1.1.12-aoki'),null)
let scenario='ok'
globalThis.fetch=async(url,opts)=>{assert.equal(opts.credentials,'omit');assert.equal(opts.headers.Authorization,undefined);assert.equal(url,'https://api.github.com/repos/nickfox395/ZhongYuToolBox_Web/releases/latest');if(scenario==='limited')return new Response('',{status:403});if(scenario==='abort')throw new DOMException('aborted','AbortError');return Response.json({tag_name:'v1.1.13-aoki',name:'release',body:'<script>no execution</script>\nNew features',html_url:scenario==='evil'?'https://evil.test/releases/tag/v1.1.13':'https://github.com/nickfox395/ZhongYuToolBox_Web/releases/tag/v1.1.13-aoki',draft:false,prerelease:scenario==='pre',assets:[]})}
assert.equal((await fetchLatestRelease('nickfox395/ZhongYuToolBox_Web')).notes,'<script>no execution</script>\nNew features')
for(const value of ['limited','evil','pre','abort']){scenario=value;await assert.rejects(fetchLatestRelease('nickfox395/ZhongYuToolBox_Web'))}
await assert.rejects(fetchLatestRelease('unknown/repo'))
console.log('PASS update version ordering, public request, unsafe links, prereleases, rate limits and abort')

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
assert.equal(compareVersions('v1.1.14-ios-beta','1.1.14-aoki'),0)
let betaCase='valid'
globalThis.fetch=async(url,opts)=>{
 assert.equal(url,'https://api.github.com/repos/nickfox395/ZhongYuToolBox_Web/releases?per_page=20');assert.equal(opts.credentials,'omit');assert.equal(opts.headers.Authorization,undefined)
 const release={tag_name:'v1.1.14-ios-beta',name:'iOS Beta',body:'upload fixes',html_url:'https://github.com/nickfox395/ZhongYuToolBox_Web/releases/tag/v1.1.14-ios-beta',draft:false,prerelease:true,assets:[{name:'iOS-beta.ipa',state:'uploaded',browser_download_url:'https://github.com/nickfox395/ZhongYuToolBox_Web/releases/download/v1.1.14-ios-beta/iOS-beta.ipa'}]}
 if(betaCase==='draft')release.draft=true;if(betaCase==='no-ipa')release.assets=[]
 return Response.json([{...release,tag_name:'v9.0.0-other'},release])
}
assert.equal((await fetchLatestRelease('nickfox395/ZhongYuToolBox_Web',undefined,'ios-beta')).tag,'v1.1.14-ios-beta')
for(const state of ['draft','no-ipa']){betaCase=state;await assert.rejects(fetchLatestRelease('nickfox395/ZhongYuToolBox_Web',undefined,'ios-beta'))}
console.log('PASS: iOS beta channel, public metadata, same main version, draft/missing IPA exclusion.')
assert.equal(compareVersions('v1.1.14-ios-beta2','1.1.14-ios-beta1'),1)
assert.equal(compareVersions('v1.1.14-ios-beta1','1.1.14-ios-beta'),1)
assert.equal(compareVersions('v1.1.15-ios-beta1','1.1.14-ios-beta9'),1)
for(const repo of ['nickfox395/ZhongYuToolBox_Web','Loshop-Studio/ZhongYuToolBox_Web']) {
 globalThis.fetch=async(url,opts)=>{
  assert.equal(url,`https://api.github.com/repos/${repo}/releases?per_page=20`);assert.equal(opts.headers.Authorization,undefined)
  return Response.json([1,3,2].map(n=>({tag_name:`v1.1.14-ios-beta${n}`,name:'Beta '+n,draft:false,prerelease:true,html_url:`https://github.com/${repo}/releases/tag/v1.1.14-ios-beta${n}`,assets:[{name:'beta.ipa',state:'uploaded',browser_download_url:`https://github.com/${repo}/releases/download/v1.1.14-ios-beta${n}/beta.ipa`}]})))
 }
 assert.equal((await fetchLatestRelease(repo,undefined,'ios-beta')).tag,'v1.1.14-ios-beta3')
}
console.log('PASS: numbered iOS betas order correctly; fork and upstream query their own beta channel.')

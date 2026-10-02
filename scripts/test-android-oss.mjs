import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

await mkdir('.test-output',{recursive:true})
await build({entryPoints:['src/utils/oss.ts'],outfile:'.test-output/android-oss.mjs',bundle:true,platform:'node',format:'esm',external:['ali-oss','crypto-js'],plugins:[{name:'android-config',setup(b){b.onResolve({filter:/^@\/config$/},()=>({path:'config',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const PLATFORM="android";',loader:'js'}));}}]})
globalThis.localStorage={getItem:key=>key==='token'?'TEST_ONLY_TOKEN':null}
const credential={bucket:'test-bucket',accessKeyId:'TEST_ONLY_ID',accessKeySecret:'TEST_ONLY_SECRET',securityToken:'TEST_ONLY_STS'}
const calls=[]
globalThis.fetch=async(url,options)=>{
 calls.push({url,options})
 if(url.endsWith('/GenerateTokenV2Async'))return new Response(JSON.stringify({result:credential}))
 return new Response('',{status:200})
}
const {uploadFile}=await import(pathToFileURL(resolve('.test-output/android-oss.mjs')))
const bytes=Uint8Array.from({length:600000},(_,i)=>i%251),file=new File([bytes],'notes.bin',{type:'application/octet-stream'})
const url=await uploadFile(file,'TEST_USER','note_v2','TEST_NONCE','folder/notes.bin')
const upload=calls[1],headers=upload.options.headers
assert.equal(upload.options.method,'PUT')
assert.deepEqual(new Uint8Array(await upload.options.body.arrayBuffer()),bytes)
assert.ok(url.startsWith('https://test-bucket.oss-cn-hangzhou.aliyuncs.com/note_v2/res/TEST_USER/'))
const path=new URL(url).pathname
const canonical=['PUT','',file.type,headers.Date,'x-oss-security-token:TEST_ONLY_STS','/test-bucket'+path].join('\n')
assert.equal(headers.Authorization,'OSS TEST_ONLY_ID:'+createHmac('sha1','TEST_ONLY_SECRET').update(canonical).digest('base64'))
globalThis.fetch=async url=>url.endsWith('/GenerateTokenV2Async')?new Response(JSON.stringify({result:credential})):new Response('denied',{status:403})
await assert.rejects(uploadFile(file,'TEST_USER','note_v2','TEST_NONCE'),/OSS 上传失败\(403\)/)
console.log('PASS: Android OSS binary PUT, STS signature/resource path and upload failure. Test credentials only; no network requests.')

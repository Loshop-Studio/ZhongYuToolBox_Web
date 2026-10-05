import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

await mkdir('.test-output',{recursive:true})
await build({entryPoints:['src/utils/oss.ts'],outfile:'.test-output/ios-oss.mjs',bundle:true,platform:'node',format:'esm',external:['ali-oss','crypto-js'],plugins:[{name:'ios-config',setup(b){b.onResolve({filter:/^@\/config$/},()=>({path:'config',namespace:'mock'}));b.onResolve({filter:/^@\/utils\/request$/},()=>({path:'request',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='request'?`export async function request(path,options={}) {const response=await fetch('http://sxz.api.zykj.org'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+localStorage.getItem('token')}});if(!response.ok)throw Error('Request failed');const data=await response.json();if(data.success===false)throw Error(data.error?.message);return data;}`:'export const PLATFORM="ios";',loader:'js'}));}}]})
globalThis.localStorage={getItem:key=>key==='token'?'TEST_ONLY_TOKEN':null}
const credential={bucket:'test-bucket',accessKeyId:'TEST_ONLY_ID',accessKeySecret:'TEST_ONLY_SECRET',securityToken:'TEST_ONLY_STS'}
const calls=[]
globalThis.fetch=async(url,options)=>{
 calls.push({url,options})
 if(url.endsWith('/GenerateTokenV2Async'))return new Response(JSON.stringify({result:credential}))
 return new Response('',{status:200})
}
const {uploadFile,fetchUserId}=await import(pathToFileURL(resolve('.test-output/ios-oss.mjs')))
const bytes=Uint8Array.from({length:600000},(_,i)=>i%251),file=new File([bytes],'notes.bin',{type:'application/octet-stream'})
const url=await uploadFile(file,'TEST_USER','note_v2','TEST_NONCE','folder/notes.bin')
const upload=calls[1],headers=upload.options.headers
assert.equal(upload.options.method,'PUT')
assert.deepEqual(new Uint8Array(await upload.options.body.arrayBuffer()),bytes)
assert.ok(url.startsWith('https://test-bucket.oss-cn-hangzhou.aliyuncs.com/note_v2/res/TEST_USER/'))
const path=new URL(url).pathname
const canonical=['PUT','',file.type,headers.Date,'x-oss-security-token:TEST_ONLY_STS','/test-bucket'+path].join('\n')
assert.equal(headers.Authorization,'OSS TEST_ONLY_ID:'+createHmac('sha1','TEST_ONLY_SECRET').update(canonical).digest('base64'))
credential.endpoint='http://test-bucket.oss-cn-shanghai.aliyuncs.com:80'
calls.length=0
const secureUrl=await uploadFile(file,'TEST_USER','note_v2','TEST_NONCE','folder/notes.bin')
assert.ok(secureUrl.startsWith('https://test-bucket.oss-cn-shanghai.aliyuncs.com/'))
assert.equal(calls[1].url,secureUrl)
const secureHeaders=calls[1].options.headers
assert.equal(secureHeaders.Authorization,'OSS TEST_ONLY_ID:'+createHmac('sha1','TEST_ONLY_SECRET').update(['PUT','',file.type,secureHeaders.Date,'x-oss-security-token:TEST_ONLY_STS','/test-bucket'+new URL(secureUrl).pathname].join('\n')).digest('base64'))
assert.deepEqual(new Uint8Array(await calls[1].options.body.arrayBuffer()),bytes)
credential.endpoint='http://custom-unencrypted.example'
await assert.rejects(uploadFile(file,'TEST_USER','note_v2','TEST_NONCE'),/HTTPS endpoint/)
delete credential.endpoint
globalThis.fetch=async url=>url.endsWith('/GenerateTokenV2Async')?new Response(JSON.stringify({result:credential})):new Response('denied',{status:403})
await assert.rejects(uploadFile(file,'TEST_USER','note_v2','TEST_NONCE'),/OSS 上传失败\(403\)/)
console.log('PASS: iOS OSS HTTP endpoint upgrades to HTTPS; binary PUT and STS signature unchanged; unencrypted custom endpoint rejected. Test credentials only; no network requests.')

const storage=new Map([['token','TEST_ONLY_TOKEN'],['userId','101']]);globalThis.localStorage={getItem:k=>storage.get(k)??null}
let infoCalls=0;globalThis.fetch=async(url,options)=>{infoCalls++;assert.equal(options.headers.Authorization,'Bearer TEST_ONLY_TOKEN');return new Response(JSON.stringify({result:{userId:102}}))}
assert.equal(await fetchUserId(),'101');assert.equal(infoCalls,0)
storage.delete('userId');assert.equal(await fetchUserId(),'102');assert.equal(infoCalls,1)
globalThis.fetch=async()=>new Response(JSON.stringify({result:{id:103}}));assert.equal(await fetchUserId(),'103')
globalThis.fetch=async()=>new Response(JSON.stringify({success:false,error:{message:'Access denied'}}));await assert.rejects(fetchUserId(),/Access denied/)
storage.delete('token');await assert.rejects(fetchUserId(),/token/)
console.log('PASS: gallery cached user ID, authenticated fallback, both official ID fields, access denial and logout.')

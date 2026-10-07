import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

await mkdir('.test-output',{recursive:true})
await build({entryPoints:['src/utils/oss.ts'],outfile:'.test-output/android-oss.mjs',bundle:true,platform:'node',format:'esm',external:['ali-oss','crypto-js'],plugins:[{name:'android-config',setup(b){b.onResolve({filter:/^@\/config$/},()=>({path:'config',namespace:'mock'}));b.onResolve({filter:/^@\/utils\/request$/},()=>({path:'request',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='request'?`export async function request(path,options={}) {const response=await fetch('http://sxz.api.zykj.org'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+localStorage.getItem('token')}});if(!response.ok)throw Error('Request failed');if(options.raw)return response;const data=await response.json();if(data.success===false)throw Error(data.error?.message);return data;}`:'export const PLATFORM="android";',loader:'js'}));}}]})
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
// Node keeps Date; emulate Chromium's forbidden-header guard and validate the
// actual upload helper through the actual bridge, rather than mocking fetch alone.
class ChromiumRequest extends Request {
 constructor(...args){super(...args);this.headers.delete('date')}
}
assert.equal(new ChromiumRequest('https://example.test',{headers:{Date:headers.Date}}).headers.get('date'),null)
const stages=new Map(),responses=new Map(),nativeUploads=[]
let sequence=0
const context={URL,Request:ChromiumRequest,Response,Headers,Event,EventTarget,Uint8Array,DOMException,AbortController,Proxy,Object,Map,Set,JSON,
 setTimeout,clearTimeout,btoa,atob,console,location:new URL('https://appassets.androidplatform.net/assets/index.html'),
 XMLHttpRequest:class extends EventTarget{},document:{addEventListener(){}},dispatchEvent(){},
 fetch:async input=>{const address=typeof input==='string'?input:input.url;assert.ok(responses.has(address));return new Response(responses.get(address))}
}
context.window=context;context.top=context
context.ZyAndroid={postMessage(raw){
 const message=JSON.parse(raw)
 queueMicrotask(()=>{
  const {method,args}=message;let result=true,error
  try{
   if(method==='getEnvironment')result={systemDark:false}
   else if(method==='beginRequest'){result='session-'+(++sequence);stages.set(result,[])}
   else if(method==='writeRequest'){const chunks=stages.get(args.session);assert.equal(args.offset,Buffer.concat(chunks).length);chunks.push(Buffer.from(args.base64,'base64'))}
   else if(method==='request'){
    const body=Buffer.concat(stages.get(args.session));let responseBody
    if(args.url.endsWith('/GenerateTokenV2Async'))responseBody=JSON.stringify({result:credential})
    else{
     nativeUploads.push(args)
     assert.equal(args.method,'PUT');assert.deepEqual(body,Buffer.from(bytes))
     assert.ok(Number.isFinite(Date.parse(args.headers.date)));assert.ok(args.headers.date.endsWith(' GMT'))
     const signed=['PUT','',args.headers['content-type'],args.headers.date,'x-oss-security-token:'+args.headers['x-oss-security-token'],'/test-bucket'+new URL(args.url).pathname].join('\n')
     assert.equal(args.headers.authorization,'OSS TEST_ONLY_ID:'+createHmac('sha1','TEST_ONLY_SECRET').update(signed).digest('base64'))
     responseBody=''
    }
    const bodyUrl='https://appassets.androidplatform.net/native-response/'+(++sequence);responses.set(bodyUrl,responseBody)
    result={status:200,statusText:'OK',headers:{},bodyUrl}
   }
  }catch(e){error=e.message}
  context.ZyAndroid.onmessage({data:JSON.stringify({id:message.id,result,error})})
 })
}}
createContext(context);runInContext(readFileSync('native-android/bridge.js','utf8'),context)
globalThis.fetch=context.fetch
assert.equal(await uploadFile(file,'TEST_USER','note_v2','TEST_NONCE','folder/notes.bin'),url)
assert.equal(nativeUploads.length,1)
console.log('PASS: Android OSS helper + native bridge with Chromium Date filtering; mock server validates date, HMAC and complete 600 KB payload.')

globalThis.fetch=async url=>url.endsWith('/GenerateTokenV2Async')?new Response(JSON.stringify({result:credential})):new Response('denied',{status:403})
await assert.rejects(uploadFile(file,'TEST_USER','note_v2','TEST_NONCE'),/OSS 上传失败\(403\)/)
console.log('PASS: Android OSS binary PUT, STS signature/resource path and upload failure. Test credentials only; no network requests.')

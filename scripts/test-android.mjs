import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=readFileSync(resolve(root,'native-android/bridge.js'),'utf8')
const checks=[]
function check(value,name){assert.ok(value,name);checks.push(name)}
function sandbox(guest=false,options={}){
  const stages=new Map(),calls=[],responses=new Map(),listeners=new EventTarget()
  let sequence=0
  class XHR extends EventTarget{constructor(){super();this.responseType='';this.timeout=0;this.withCredentials=false}open(){} }
  class GuardedRequest extends Request{constructor(...args){super(...args);if(options.stripDate)this.headers.delete('date')}}
  const context={URL,Request:GuardedRequest,Response,Headers,Event,EventTarget,Uint8Array,DOMException,AbortController,Proxy,Object,Map,Set,JSON,
    setTimeout,clearTimeout,btoa,atob,console,location:new URL(guest?'https://sxz.school.zykj.org/index.html':'https://appassets.androidplatform.net/assets/index.html'),
    XMLHttpRequest:XHR,document:{addEventListener(){}},addEventListener:listeners.addEventListener.bind(listeners),dispatchEvent:listeners.dispatchEvent.bind(listeners),
    fetch:async(input)=>{const url=typeof input==='string'?input:input.url;if(!responses.has(url))throw Error('Unexpected native browser fetch: '+url);return new Response(responses.get(url))}
  }
  context.window=context;context.top=context
  context.ZyAndroid={postMessage(raw){
    const message=JSON.parse(raw);calls.push(message)
    queueMicrotask(()=>{
      const {method,args}=message;let result=true,error
      if(method==='getEnvironment')result={systemDark:true}
      else if(method==='beginRequest'||method==='beginSave'){result='session-'+(++sequence);stages.set(result,[])}
      else if(method==='writeRequest'||method==='writeSaveChunk'){const chunks=stages.get(args.session),bytes=Buffer.from(args.base64,'base64');assert.equal(args.offset,Buffer.concat(chunks).length);chunks.push(bytes)}
      else if(method==='request'){
        if(args.url.endsWith('/failure'))error='Simulated network failure'
        else{const bodyUrl='https://appassets.androidplatform.net/native-response/'+(++sequence)+'.bin';responses.set(bodyUrl,Buffer.concat(stages.get(args.session)));result={status:args.url.endsWith('/empty')?204:200,statusText:'OK',headers:{'Content-Type':'application/octet-stream','ETag':'test-tag'},bodyUrl}}
      } else if(method==='finishSave'){assert.equal(Buffer.concat(stages.get(args.session)).length,args.size);result={canceled:false}}
      context.ZyAndroid.onmessage({data:JSON.stringify({id:message.id,result,error})})
    })
  }}
  createContext(context);runInContext(source,context)
  return {context,calls,stages}
}
const {context,calls,stages}=sandbox()
await new Promise(resolve=>setTimeout(resolve,0))
check(context.nativeHost.kind==='android'&&context.nativeHost.systemDark===true,'Android 宿主和系统深色状态')
const bytes=Uint8Array.from({length:600000},(_,i)=>i%256)
const response=await context.fetch('http://sxz.api.zykj.org/api/test',{method:'POST',headers:{Authorization:'Bearer test-only'},body:bytes})
assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);checks.push('600 KB 二进制跨多块完整往返，无零字节/编码损坏')
check(response.headers.get('etag')==='test-tag','响应头透传（OSS ETag）')
const request=calls.find(c=>c.method==='request')
check(request.args.headers.authorization==='Bearer test-only'&&request.args.method==='POST','鉴权头及 HTTP 方法透传')
const empty=await context.fetch('http://sxz.api.zykj.org/empty')
check(empty.status===204&&(await empty.text())==='','204 空响应')
await assert.rejects(context.fetch('http://sxz.api.zykj.org/failure'),/Simulated network failure/);checks.push('网络错误向界面传播')
const saved=await context.nativeHost.saveFile(bytes.buffer,'worksheet.pdf')
check(saved.canceled===false,'分块保存并校验原始文件长度')
const xhr=new context.XMLHttpRequest()
xhr.open('POST','http://sxz.api.zykj.org/xhr');xhr.responseType='arraybuffer'
await new Promise((resolve,reject)=>{xhr.onload=resolve;xhr.onerror=reject;xhr.send(bytes)})
assert.deepEqual(new Uint8Array(xhr.response),bytes);checks.push('官方页面 XHR/Axios 二进制响应')
const guest=sandbox(true)
check(!guest.context.nativeHost,'远程页面没有本机保存/设备/窗口接口')
const guarded=sandbox(false,{stripDate:true})
const signingDate='Tue, 06 Oct 2026 00:00:00 GMT'
for(const headers of [{Date:signingDate},new Headers({date:signingDate}),[['DATE',signingDate]]]){
  await guarded.context.fetch('https://test.oss-cn-hangzhou.aliyuncs.com/test',{method:'PUT',headers,body:bytes})
  check(guarded.calls.filter(c=>c.method==='request').at(-1).args.headers.date===signingDate,'Chromium 过滤 Date 后仍原样透传 OSS 签名日期（多种 HeadersInit）')
}
const frame={...context};frame.window=frame;frame.top={};frame.ZyAndroid={postMessage(){throw Error('iframe must not call native')}}
delete frame.__zytbNetworkInstalled;delete frame.nativeHost
createContext(frame);runInContext(source,frame);check(!frame.nativeHost,'iframe 不注册原生桥')
console.log(JSON.stringify({passed:checks.length,checks},null,2))

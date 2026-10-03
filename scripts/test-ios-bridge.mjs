import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=readFileSync(resolve(root,'native-ios/bridge.js'),'utf8')
const checks=[]
function check(value,name){assert.ok(value,name);checks.push(name)}
function sandbox(guest=false,options={}){
  const stages=new Map(),calls=[],responses=new Map(),listeners=new EventTarget()
  responses.set('http://127.0.0.1:18765/example/page_router.bin',readFileSync(resolve(root,'public/example/page_router.bin')))
  let sequence=0
  class XHR extends EventTarget{constructor(){super();this.responseType='';this.timeout=0;this.withCredentials=false}open(){} }
  const GuardedRequest=options.stripDate?class extends Request {constructor(...args){super(...args);this.headers.delete('Date')}}:Request
  const context={URL,Request:GuardedRequest,Response,Headers,Event,EventTarget,Uint8Array,DOMException,AbortController,Proxy,Object,Map,Set,JSON,
    setTimeout,clearTimeout,btoa,atob,console,location:new URL(guest?'https://sxz.school.zykj.org/index.html':'http://127.0.0.1:18765/index.html'),
    XMLHttpRequest:XHR,document:{addEventListener(){},documentElement:{classList:{add(){}}}},addEventListener:listeners.addEventListener.bind(listeners),dispatchEvent:listeners.dispatchEvent.bind(listeners),
    fetch:async(input)=>{const url=typeof input==='string'?input:input.url;if(!responses.has(url))throw Error('Unexpected native browser fetch: '+url);return new Response(responses.get(url))}
  }
  context.window=context;context.top=context
  context.webkit={messageHandlers:{zytb:{async postMessage(message){
    calls.push(message); const {method,args}=message; let result=true;
    if(method==='beginRequest' && options.beginGate)await options.beginGate;
    if(method==='getEnvironment')result={systemDark:true};
    else if(method==='beginRequest'||method==='beginSave'){result='session-'+(++sequence);stages.set(result,[])}
    else if(method==='writeRequest'||method==='writeSaveChunk'){const chunks=stages.get(args.session),bytes=Buffer.from(args.base64,'base64');assert.equal(args.offset,Buffer.concat(chunks).length);chunks.push(bytes)}
    else if(method==='request'){
      if(args.url.endsWith('/failure'))throw Error('Simulated network failure');
      if(options.requestGate)await options.requestGate;
      const bodyUrl='http://127.0.0.1:18765/native-response/'+(++sequence)+'.bin';responses.set(bodyUrl,Buffer.concat(stages.get(args.session)));result={status:args.url.endsWith('/empty')?204:200,statusText:'OK',headers:{'Content-Type':'application/octet-stream','ETag':'test-tag'},bodyUrl};
    }else if(method==='finishSave'){assert.equal(Buffer.concat(stages.get(args.session)).length,args.size);result={canceled:!!options.cancelSave}}
    return result;
  }}}}
  createContext(context);runInContext(source,context)
  return {context,calls,stages}
}
const {context,calls,stages}=sandbox()
await new Promise(resolve=>setTimeout(resolve,0))
check(context.nativeHost.kind==='ios'&&context.nativeHost.systemDark===true,'iOS 宿主和系统深色状态')
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
const frame={...context};frame.window=frame;frame.top={};frame.ZyiOS={postMessage(){throw Error('iframe must not call native')}}
delete frame.__zytbNetworkInstalled;delete frame.nativeHost
createContext(frame);runInContext(source,frame);check(!frame.nativeHost,'iframe 不注册原生桥')
const aborted=new AbortController();aborted.abort()
const before=calls.length
await assert.rejects(context.fetch('http://sxz.api.zykj.org/api/test',{signal:aborted.signal}),{name:'AbortError'})
check(calls.length===before,'预先取消不创建原生会话')
let beginReady;const beginGate=new Promise(resolve=>beginReady=resolve)
const race=sandbox(false,{beginGate}),cancel=new AbortController()
const raceFetch=race.context.fetch('http://sxz.api.zykj.org/api/test',{signal:cancel.signal});cancel.abort();beginReady()
await assert.rejects(raceFetch,{name:'AbortError'})
check(race.calls.some(call=>call.method==='cancelRequest')&&!race.calls.some(call=>call.method==='request'),'创建会话期间取消，清理会话且不发送远端请求')
let requestReady;const requestGate=new Promise(resolve=>requestReady=resolve)
const active=sandbox(false,{requestGate}),during=new AbortController()
const inFlight=active.context.fetch('http://sxz.api.zykj.org/api/test',{signal:during.signal})
await new Promise(resolve=>setTimeout(resolve,0));during.abort();requestReady()
await assert.rejects(inFlight,{name:'AbortError'})
check(active.calls.some(call=>call.method==='cancelRequest'),'处理中取消转交原生网络层')
const canceled=sandbox(false,{cancelSave:true})
check((await canceled.context.nativeHost.saveFile(bytes.buffer,'notes.pdf')).canceled===true,'用户取消文件导出，不报告保存成功')
check(context.nativeHost.readNoteTemplate && context.nativeHost.syncNavigation,'模板读取与路由同步桥可用')
assert.deepEqual(Buffer.from(await context.nativeHost.readNoteTemplate('page_router.bin')),readFileSync(resolve(root,'public/example/page_router.bin')))
checks.push('真实笔记模板通过正确包内 /example/ 路径读取，字节一致')
await assert.rejects(context.nativeHost.readNoteTemplate('../index.html'),/不支持此笔记模板路径/)
checks.push('模板白名单拒绝路径穿越')
const guarded=sandbox(false,{stripDate:true})
await guarded.context.fetch('https://test.oss-cn-hangzhou.aliyuncs.com/test',{method:'PUT',headers:{Date:'Thu, 01 Oct 2026 00:00:00 GMT'},body:bytes})
check(guarded.calls.find(call=>call.method==='request').args.headers.date==='Thu, 01 Oct 2026 00:00:00 GMT','WebKit 过滤 Date 时仍保留 OSS 签名日期')
console.log(JSON.stringify({passed:checks.length,checks},null,2))

console.log('PASS: iOS bridge '+checks.length+' checks; simulated native transport, no account/network access.')

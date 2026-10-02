(() => {
  if (window !== window.top || !window.ZyAndroid || window.__zytbNetworkInstalled) return;
  window.__zytbNetworkInstalled = true;
  const LOCAL = 'https://appassets.androidplatform.net';
  const local = location.origin === LOCAL;
  const originalFetch = window.fetch.bind(window);
  let nextId = 0, systemDark = false;
  const pending = new Map();
  const call = (method, args = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('原生操作超时，请重试')); }, 300000);
    pending.set(id, {resolve, reject, timer});
    ZyAndroid.postMessage(JSON.stringify({id, method, args}));
  });
  ZyAndroid.onmessage = ({data}) => {
    const reply = JSON.parse(data), item = pending.get(reply.id);
    if (!item) return;
    pending.delete(reply.id); clearTimeout(item.timer);
    reply.error ? item.reject(new Error(reply.error)) : item.resolve(reply.result);
  };
  function encode(bytes) {
    let binary = '';
    for (let i=0; i<bytes.length; i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  const remote = url => {
    try { const u=new URL(url,location.href); return ['http:','https:'].includes(u.protocol) && u.origin!==LOCAL; } catch { return false; }
  };
  window.fetch = async (input, init) => {
    const req = new Request(input instanceof Request ? input : new URL(String(input),location.href), init);
    if (!remote(req.url)) return originalFetch(req);
    if (req.signal.aborted) throw new DOMException('请求已取消','AbortError');
    const session = await call('beginRequest');
    const abort = () => { call('cancelRequest',{session}).catch(()=>{}); };
    req.signal.addEventListener('abort',abort,{once:true});
    try {
      if (req.body) {
        const reader=req.body.getReader(); let offset=0;
        for (;;) {
          const {value,done}=await reader.read(); if(done) break;
          for(let i=0;i<value.length;i+=192*1024) {
            if(req.signal.aborted) throw new DOMException('请求已取消','AbortError');
            const bytes=value.subarray(i,i+192*1024);
            await call('writeRequest',{session,offset,base64:encode(bytes)}); offset+=bytes.length;
          }
        }
      }
      const result=await call('request',{session,url:req.url,method:req.method,headers:Object.fromEntries(req.headers)});
      if(req.signal.aborted) throw new DOMException('请求已取消','AbortError');
      const bytes = [204,205,304].includes(result.status) || req.method==='HEAD' ? null : (await originalFetch(result.bodyUrl)).body;
      return new Response(bytes,{status:result.status,statusText:result.statusText,headers:result.headers});
    } catch(error) { abort(); throw error; }
    finally { req.signal.removeEventListener('abort',abort); }
  };
  // Official embedded pages use XHR (Axios); route only HTTP(S) calls through native networking.
  const OriginalXHR=window.XMLHttpRequest;
  class NativeXHR extends EventTarget {
    constructor(){ super(); this.readyState=0; this.status=0; this.response=null; this.responseText=''; this.responseType=''; this.timeout=0; this.withCredentials=false; this.upload=new EventTarget(); this.headers={}; }
    emit(type){ const event=new Event(type); this.dispatchEvent(event); if(typeof this['on'+type]==='function')this['on'+type](event); }
    open(method,url,async=true){this.method=method;this.url=new URL(url,location.href).href;this.async=async;this.readyState=1;this.emit('readystatechange');}
    setRequestHeader(k,v){this.headers[k]=this.headers[k]?this.headers[k]+', '+v:v;}
    getAllResponseHeaders(){return this.responseHeaders||'';}
    getResponseHeader(name){return this.headerMap?.get(name)||null;}
    overrideMimeType(type){this.mime=type;}
    abort(){this.controller?.abort();}
    async send(body=null){
      if(this.async===false)throw new Error('Android 不支持同步远程请求');
      this.controller=new AbortController(); let timeout;
      if(this.timeout)timeout=setTimeout(()=>{this.timedOut=true;this.controller.abort();},this.timeout);
      this.emit('loadstart');
      try{
        const response=await fetch(this.url,{method:this.method,headers:this.headers,body:['GET','HEAD'].includes(this.method.toUpperCase())?undefined:body,signal:this.controller.signal});
        this.status=response.status;this.statusText=response.statusText;this.responseURL=this.url;this.headerMap=response.headers;
        this.responseHeaders=[...response.headers].map(([k,v])=>k+': '+v).join('\r\n');
        this.readyState=2;this.emit('readystatechange');this.readyState=3;this.emit('readystatechange');
        if(this.responseType==='arraybuffer')this.response=await response.arrayBuffer();
        else if(this.responseType==='blob')this.response=await response.blob();
        else{this.responseText=await response.text();this.response=this.responseType==='json'?JSON.parse(this.responseText):this.responseText;}
        this.readyState=4;this.emit('readystatechange');this.emit('load');
      }catch(error){this.status=0;this.readyState=4;this.emit('readystatechange');this.emit(this.timedOut?'timeout':this.controller.signal.aborted?'abort':'error');}
      finally{clearTimeout(timeout);this.emit('loadend');}
    }
  }
  window.XMLHttpRequest = function(){
    const native=new OriginalXHR(); let chosen=native;
    return new Proxy(native,{
      get(_target,key){if(key==='open')return(method,url,async=true,...rest)=>{chosen=remote(url)?new NativeXHR():native;for(const prop of ['onload','onerror','onabort','ontimeout','onreadystatechange','onloadend','responseType','timeout','withCredentials'])if(native[prop]!=null)chosen[prop]=native[prop];return chosen.open(method,url,async,...rest);};const value=chosen[key];return typeof value==='function'?value.bind(chosen):value;},
      set(_target,key,value){chosen[key]=value;return true;}
    });
  };
  Object.assign(window.XMLHttpRequest,{UNSENT:0,OPENED:1,HEADERS_RECEIVED:2,LOADING:3,DONE:4});
  if (!local) return; // Guest pages have networking only, never file/device/window capabilities.
  const host={
    kind:'android', get systemDark(){return systemDark;},
    getDeviceId:()=>call('getDeviceId'),
    readNoteTemplate:async relative=>new Uint8Array(await (await originalFetch(LOCAL+'/assets/example/'+relative)).arrayBuffer()),
    saveFile:async(buffer,filename)=>{
      const session=await call('beginSave',{filename}); const bytes=new Uint8Array(buffer);
      try{
        for(let offset=0;offset<bytes.length;offset+=192*1024)await call('writeSaveChunk',{session,offset,base64:encode(bytes.subarray(offset,offset+192*1024))});
        return await call('finishSave',{session,size:bytes.length});
      }catch(error){await call('abortSave',{session}).catch(()=>{});throw error;}
    },
    openEmbedded:args=>call('openEmbedded',args),resizeEmbedded:args=>call('resizeEmbedded',args),
    closeEmbedded:args=>call('closeEmbedded',args),getEmbeddedState:args=>call('getEmbeddedState',args),
    setThemeDark:dark=>call('setThemeDark',{dark})
  };
  Object.defineProperty(window,'nativeHost',{value:Object.freeze(host)});
  window.__zytbSetSystemDark=dark=>{systemDark=!!dark;window.dispatchEvent(new Event('zytb-system-theme'));};
  call('getEnvironment').then(env=>window.__zytbSetSystemDark(env.systemDark)).catch(()=>{});
  window.open=url=>{if(url)call('openExternal',{url:new URL(url,location.href).href}).catch(()=>{});return null;};
  document.addEventListener('click',event=>{const link=event.target.closest?.('a');if(link?.href&&remote(link.href)){event.preventDefault();call('openExternal',{url:link.href}).catch(()=>{});}},true);
})();

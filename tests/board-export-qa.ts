import { createApp, h, ref } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { EzyBoardViewer } from 'ezy-board-viewer'
import { boardCodecQa } from './board-codec-qa'
import { boardReplyQa } from './board-reply-qa'
const source=ref<any>(null), result=ref('点击开始测试'), links=ref<{url:string,name:string}[]>([])
async function run() {
  const checks:string[]=[]
  const check=(ok:boolean,name:string)=>{if(!ok)throw Error(name);checks.push(name);result.value=checks.join('\n')}
  try {
    for(const link of links.value)URL.revokeObjectURL(link.url)
    links.value=[]
    const files=await boardCodecQa(check)
    await boardReplyQa(check)
    source.value=files.source
    links.value=[{url:URL.createObjectURL(files.svg),name:'static.svg'},{url:URL.createObjectURL(files.mp4),name:'recording.mp4'}]
    result.value='PASS\n'+checks.join('\n')+'\nSVG '+files.svg.size+' bytes; MP4 '+files.mp4.size+' bytes'
  } catch(e) { result.value='FAIL '+((e as Error).stack||e)+'\n'+checks.join('\n') }
}
createApp({setup:()=>()=>h('main',{style:'max-width:900px;margin:auto;font-family:sans-serif'},[h('h1','随身答画板 · 离线验证'),h('p','仅使用合成画板和 440Hz 音频，不访问中育账号。'),h('button',{onClick:run},'开始导出验证'),h('pre',{id:'result',style:'white-space:pre-wrap'},result.value),...links.value.map(item=>h('a',{href:item.url,download:item.name,style:'display:block'},'下载 '+item.name)),source.value?h(EzyBoardViewer,{source:source.value,autoplay:false,style:'height:420px'}):null])}).use(ElementPlus).mount('#app')

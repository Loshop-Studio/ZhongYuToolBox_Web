// Disposable localhost fixture. Every remote fetch is intercepted; no official writes.
import { aesEncrypt, aesDecrypt } from '../src/utils/crypto'
const base = 'http://sxz.api.zykj.org'
localStorage.setItem('token','test.'+btoa(JSON.stringify({sub:'QA_UI_ONLY',exp:Math.floor(Date.now()/1000)+3600}))+'.test')
for(const [key,value] of Object.entries({apiBaseUrl:base,userId:'QA_UI_ONLY',realName:'演示账号 · 测试数据',photo:'icon.png',schoolCode:'sxz'})) localStorage.setItem(key,value)
Object.defineProperty(window,'nativeHost',{value:{kind:'webview2',setThemeDark:async()=>{}}})
const canvas=document.createElement('canvas');canvas.width=720;canvas.height=450
const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,720,450);ctx.fillStyle='#705776';ctx.font='30px sans-serif';ctx.fillText('x² + y² = 1',60,70);ctx.strokeStyle='#a693ac';ctx.lineWidth=4;ctx.beginPath();ctx.arc(360,240,130,0,2*Math.PI);ctx.stroke()
const image=canvas.toDataURL('image/png')
const notes=[{fileId:'QA_NOTE',fileName:'数学 · 几何复习',type:1,fileUrl:'https://fixture.invalid/note',parentId:'0',version:4,shared:false,isRecycleBin:false,expirationTimeStamp:null,updateTime:'2026-10-01'}]
const task={id:77,examTaskId:77,examId:991,examName:'数学 · 单元测评（离线演示）',topicName:'数学',enableScore:true,groups:[{questions:[{id:11,originScore:2,myScore:10,score:10,completed:false,number:'1'},{id:12,originScore:1,score:5,number:'2'}]}]}
const html='<div class="stem"><p>已知 x² + y² = 1，求图形面积。</p><img src="'+image+'"></div><div class="answers"><p>答案：π。</p></div><div class="analysis"><p>半径为 1，由圆的面积公式可得。</p></div>'
const json=(data:any)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})
const originalFetch=window.fetch.bind(window)
window.fetch=async(url,options)=>{
  const address=String(url)
  if(address.startsWith('data:')||address.startsWith('blob:')||address.startsWith('/')||address.startsWith('http://127.0.0.1:5175/'))return originalFetch(url,options)
  if(address.includes('/CloudNotes/api/Notes/Update')){const payload=JSON.parse(aesDecrypt(String(options?.body)));notes[0].fileName=payload.fileName;notes[0].version++;return json({code:0,data:aesEncrypt(JSON.stringify({version:notes[0].version}))})}
  if(address.includes('/CloudNotes/api/Notes/MoveToRecycleBin')){notes[0].isRecycleBin=true;return json({code:0})}
  if(address.includes('/CloudNotes/api/Notes/'))return json({code:0,data:aesEncrypt(JSON.stringify({noteList:notes.filter(n=>!n.isRecycleBin)}))})
  if(address.includes('GetStudentTaskListAsync'))return json({success:true,result:{items:[task],totalCount:1}})
  if(address.includes('GetExamTaskAsync'))return json({success:true,result:task})
  if(address.includes('GetQuestionViewAsync'))return json({success:true,result:{path:'/Question/View/11',isInMistakeBook:true}})
  if(address.includes('/Question/View/'))return new Response(html)
  if(address.includes('GetMyMistakeBooksAsync'))return json({result:[{id:1,topic:{content:'数学'}}]})
  if(address.includes('SearchMistakeQstItemsAsync'))return json({result:{totalCount:2,items:[{id:1,source:'数学 · 单元测评',stemShoot:image,creationTime:'2026-10-01'},{id:2,source:'数学 · 综合训练',stemShoot:image,creationTime:'2026-09-30'}]}})
  if(address.includes('GetMistakeQstItemDetailInfoAsync'))return json({result:{qstPath:'/Question/View/11',stemShoot:image}})
  throw new Error('离线 UI 测试阻止网络：'+address)
}
await import('../src/main')

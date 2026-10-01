// Disposable localhost fixture. Every remote fetch is intercepted; no official writes.
import { aesEncrypt, aesDecrypt } from '../src/utils/crypto'
const base = 'http://sxz.api.zykj.org'
localStorage.setItem('token','test.'+btoa(JSON.stringify({sub:'QA_UI_ONLY',exp:Math.floor(Date.now()/1000)+3600}))+'.test')
for(const [key,value] of Object.entries({apiBaseUrl:base,userId:'QA_UI_ONLY',realName:'演示账号 · 测试数据',photo:'icon.png',schoolCode:'sxz'})) localStorage.setItem(key,value)
Object.defineProperty(window,'nativeHost',{value:{kind:'webview2',setThemeDark:async()=>{}}})
const canvas=document.createElement('canvas');canvas.width=720;canvas.height=450
const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,720,450);ctx.fillStyle='#705776';ctx.font='30px sans-serif';ctx.fillText('x² + y² = 1',60,70);ctx.strokeStyle='#a693ac';ctx.lineWidth=4;ctx.beginPath();ctx.arc(360,240,130,0,2*Math.PI);ctx.stroke()
const image=canvas.toDataURL('image/png')
const noteTemplate={type:1,fileUrl:'https://fixture.invalid/note',parentId:'0',version:4,shared:false,isRecycleBin:false,expirationTimeStamp:null,updateTime:'2026-10-01'}
const notes=[{...noteTemplate,fileId:'QA_NOTE',fileName:'数学 · 几何复习'},{...noteTemplate,fileId:'QA_NOTE_2',fileName:'物理 · 力学复习'},{...noteTemplate,type:0,fileId:'QA_FOLDER',fileName:'归档'}]
const task={id:77,examTaskId:77,examId:991,examName:'数学 · 单元测评（离线演示）',topicName:'数学',enableScore:true,groups:[{questions:[{id:11,originScore:2,myScore:10,score:10,completed:false,number:'1'},{id:12,originScore:1,score:5,number:'2'}]}]}
const html='<div class="stem"><p>已知 x² + y² = 1，求图形面积。</p><img src="'+image+'"></div><div class="answers"><p>答案：π。</p></div><div class="analysis"><p>半径为 1，由圆的面积公式可得。</p></div>'
let mistakeItems=[{id:1,source:'数学 · 单元测评',stemShoot:image,creationTime:'2026-10-01'},{id:2,source:'数学 · 综合训练',stemShoot:image,creationTime:'2026-09-30'}]
const json=(data:any)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})
const originalFetch=window.fetch.bind(window)
window.fetch=async(url,options)=>{
  const address=String(url)
  if (/GetExamTaskAsync|GetExamOverviewAsync|GetQuestionAnalysisAsync/.test(address)) {
    const params = new URL(address).searchParams, id = Number(params.get('id') ?? params.get('examId'))
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('无效的测评编号：'+String(id))
  }
  if(address.startsWith('data:')||address.startsWith('blob:')||address.startsWith('/')||address.startsWith('http://127.0.0.1:5175/'))return originalFetch(url,options)
  if(address.includes('/CloudNotes/api/Notes/Update')){const payload=JSON.parse(aesDecrypt(String(options?.body)));const note=notes.find(n=>n.fileId===payload.fileId)!;Object.assign(note,payload);note.version++;return json({code:0,data:aesEncrypt(JSON.stringify({version:note.version}))})}
  if(address.includes('/CloudNotes/api/Notes/MoveToRecycleBin')){notes[0].isRecycleBin=true;return json({code:0})}
  if(address.includes('/CloudNotes/api/Notes/')){const parent=address.includes('GetByParentId') ? new URLSearchParams(aesDecrypt(new URL(address).search.slice(1))).get('parentid') : null;return json({code:0,data:aesEncrypt(JSON.stringify({noteList:notes.filter(n=>!n.isRecycleBin && (!parent || n.parentId===parent))}))})}
  if(address.includes('GetStudentTaskListAsync'))return json({success:true,result:{items:[task],totalCount:1}})
  if(address.includes('GetExamTaskAsync'))return json({success:true,result:task})
  if(address.includes('GetExamOverviewAsync'))return json({success:true,result:{studentGrades:[{studentId:'QA_UI_ONLY',studentName:'演示账号'},{studentId:'OTHER',studentName:'其他学生'}]}})
  if(address.includes('GetQuestionAnalysisAsync'))return json({success:true,result:{testGroupAnalysis:[{number:1,title:'单元练习',score:15,testQuestionAnalysis:[{questionId:11,number:1,score:10,errorCount:1,errorStudents:['QA_UI_ONLY']},{questionId:12,number:2,score:5,errorCount:1,errorStudents:['OTHER']}]}]}})
  if(address.includes('GetQuestionViewAsync'))return json({success:true,result:{path:'/Question/View/11',isInMistakeBook:true}})
  if(address.includes('/Question/View/'))return new Response(html)
  if(address.includes('GetMyMistakeBooksAsync'))return json({result:[{id:1,topic:{content:'数学'}}]})
  if(address.includes('MultiRemoveMistakeItemsAsync')) {
    if (new URL(location.href).searchParams.get('deleteFailure') === '1') return json({success:false,error:{message:'离线模拟：官方拒绝删除'}})
    const body=JSON.parse(String(options?.body)); if (body.bookId!==1 || !Array.isArray(body.itemIds)) throw new Error('删除参数不正确')
    mistakeItems=mistakeItems.filter(item=>!body.itemIds.includes(item.id));return json({success:true,result:null})
  }
  if(address.includes('SearchMistakeQstItemsAsync'))return json({result:{totalCount:mistakeItems.length,items:mistakeItems}})
  if(address.includes('GetMistakeQstItemDetailInfoAsync'))return json({result:{qstPath:'/Question/View/11',stemShoot:image}})
  throw new Error('离线 UI 测试阻止网络：'+address)
}
await import('../src/main')

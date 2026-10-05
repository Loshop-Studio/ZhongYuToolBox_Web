// Disposable localhost fixture. Every remote fetch is intercepted; no official writes.
import { createBoard } from 'ezy-board-viewer'
import { aesEncrypt, aesDecrypt } from '../src/utils/crypto'
const mobilePlatform = import.meta.env.VITE_PLATFORM
const nativeIOS = mobilePlatform === 'ios' && new URL(location.href).searchParams.has('nativeChrome')
const base = 'http://sxz.api.zykj.org'
localStorage.setItem('token','test.'+btoa(JSON.stringify({sub:'QA_UI_ONLY',exp:Math.floor(Date.now()/1000)+3600}))+'.test')
for(const [key,value] of Object.entries({apiBaseUrl:base,userId:'QA_UI_ONLY',realName:'演示账号 · 测试数据',photo:'icon.png',schoolCode:'sxz'})) localStorage.setItem(key,value)
Object.defineProperty(window,'nativeHost',{value:{kind:nativeIOS ? 'ios' : mobilePlatform === 'android' ? 'android' : 'webview2',setThemeDark:async()=>{},syncNavigation:async()=>{}}})
if (nativeIOS) {
  document.documentElement.classList.add('ios-native-chrome')
  document.documentElement.style.setProperty('--ios-native-bottom','83px')
}
Object.defineProperty(window,'electronAPI',{value:{saveFile:async(bytes:ArrayBuffer,name:string)=>{
  document.getElementById('fixture-export')?.remove()
  const link=document.createElement('a');link.id='fixture-export';link.textContent='测试导出文件：'+name;link.download=name;link.href=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));link.style.cssText='position:fixed;bottom:12px;right:24px;z-index:9999;background:#fff;padding:12px;border:1px solid #705776;color:#705776';document.body.append(link);return {canceled:false}
}}})
const canvas=document.createElement('canvas');canvas.width=720;canvas.height=450
const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,720,450);ctx.fillStyle='#705776';ctx.font='30px sans-serif';ctx.fillText('x² + y² = 1',60,70);ctx.strokeStyle='#a693ac';ctx.lineWidth=4;ctx.beginPath();ctx.arc(360,240,130,0,2*Math.PI);ctx.stroke()
const image=canvas.toDataURL('image/png')
const previewBoard=createBoard({width:720,height:450,screenshot:false})
previewBoard.page().text('数学 · 几何复习',{x:40,y:55,size:32})
previewBoard.page().stroke([[60,180],[280,120],[600,280]],{lineWidth:5,color:'#705776'})
previewBoard.addPage({width:450,height:720}).text('竖版矢量页',{x:30,y:70,size:28})
const previewFiles=await previewBoard.toFiles(), previewDirs=[...new Set(previewFiles.filter(f=>f.path.endsWith('snapshot.bin')).map(f=>f.path.split('/')[0]))]
const previewBytes=new Map<string,Blob>(), previewResources:any[]=[]
for(const file of previewFiles){const idx=previewDirs.indexOf(file.path.split('/')[0]);if(idx<0)continue;const url=location.origin+'/fixture-note/'+file.path+'?signature=QA';previewBytes.set(url,file.blob);previewResources.push({pageIndex:idx*2,resourceType:1,ossImageUrl:url})}
previewBytes.set(location.origin+'/fixture-note/preview.png',await (await fetch(image)).blob())
previewResources.push({pageIndex:1,resourceType:2,ossImageUrl:location.origin+'/example/a888b5fb-e65d-4611-a3af-1f80a0fb6ced/screenshot.png'})
const noteTemplate={type:1,fileUrl:'https://fixture.invalid/note',parentId:'0',version:4,shared:false,isRecycleBin:false,expirationTimeStamp:null,updateTime:'2026-10-01'}
let notes=[{...noteTemplate,fileId:'QA_NOTE',fileName:'数学 · 几何复习'},{...noteTemplate,fileId:'QA_NOTE_2',fileName:'物理 · 力学复习'},{...noteTemplate,type:0,fileId:'QA_FOLDER',fileName:'归档'},{...noteTemplate,fileId:'QA_RECYCLE',fileName:'已废弃 · 几何草稿',isRecycleBin:true}]
if (new URL(location.href).searchParams.has('density')) notes.push(...Array.from({length:20},(_,i)=>({...noteTemplate,fileId:'QA_DENSITY_'+i,fileName:'离线测试笔记 '+(i+1)})))
const task={id:77,examTaskId:77,examId:991,examName:'数学 · 单元测评（离线演示）',topicName:'数学',enableScore:true,groups:[{questions:[{id:11,originScore:2,myScore:10,score:10,completed:false,number:'1'},{id:12,originScore:1,score:5,number:'2'}]}]}
const html='<div class="stem"><p>已知 x² + y² = 1，求图形面积。</p><img src="'+image+'"></div><div class="answers"><p>答案：π。</p></div><div class="analysis"><p>半径为 1，由圆的面积公式可得。</p></div>'
let mistakeItems=[{id:1,source:'数学 · 单元测评',stemShoot:image,creationTime:'2026-10-01'},{id:2,source:'数学 · 综合训练',stemShoot:image,creationTime:'2026-09-30'}]
const json=(data:any)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})
const originalFetch=window.fetch.bind(window)
window.fetch=async(url,options)=>{
  const address=String(url)
  if(address.startsWith('https://api.github.com/repos/')) return originalFetch(url,options)
  if (/GetExamTaskAsync|GetExamOverviewAsync|GetQuestionAnalysisAsync/.test(address)) {
    const params = new URL(address).searchParams, id = Number(params.get('id') ?? params.get('examId'))
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('无效的测评编号：'+String(id))
  }
  if(previewBytes.has(address))return new Response(previewBytes.get(address))
  if(address.includes('/CloudNotes/api/Resources/'))return json({code:0,data:aesEncrypt(JSON.stringify({resourceList:previewResources}))})
  if(address.startsWith('data:')||address.startsWith('blob:')||address.startsWith('/')||address.startsWith(location.origin+'/'))return originalFetch(url,options)
  if(address.includes('/CloudNotes/api/Notes/Update')){const payload=JSON.parse(aesDecrypt(String(options?.body)));const note=notes.find(n=>n.fileId===payload.fileId)!;Object.assign(note,payload);note.version++;return json({code:0,data:aesEncrypt(JSON.stringify({version:note.version}))})}
  if(address.includes('/CloudNotes/api/Notes/MoveToRecycleBin')){notes[0].isRecycleBin=true;return json({code:0})}
  if(address.includes('/CloudNotes/api/Notes/Delete')){if(new URL(location.href).searchParams.get('deleteFailure')==='1')return json({code:1001,msg:'离线模拟：官方拒绝删除'});const ids=JSON.parse(aesDecrypt(String(options?.body)));notes=notes.filter(n=>!ids.includes(n.fileId));return json({code:0})}
  if(address.includes('/CloudNotes/api/Notes/')){const parent=address.includes('GetByParentId') ? new URLSearchParams(aesDecrypt(new URL(address).search.slice(1))).get('parentid') : null;return json({code:0,data:aesEncrypt(JSON.stringify({noteList:notes.filter(n=>!parent || n.parentId===parent)}))})}
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

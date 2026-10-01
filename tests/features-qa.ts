import { createPinia, setActivePinia } from 'pinia'
import { PDFDocument } from 'pdf-lib'
import { aesEncrypt, aesDecrypt } from '../src/utils/crypto'
import { buildRenamePayload, renameNote, moveNotesToRecycleBin, moveNotesToFolder } from '../src/api/note'
import { getExamTasks } from '../src/api/exam'
import { analysisWrongQuestions, saveExamReview } from '../src/utils/examReview'
import { officialEmbedUrl, officialUserBootstrap } from '../src/utils/officialEmbed'
import { runNoteUploadQueue, type NoteUploadJob } from '../src/utils/noteUploadQueue'
import { searchMistakes, fetchQstHtml } from '../src/api/mistake'
import { syncExamMistakes, listLocalMistakes } from '../src/utils/examMistakes'
import { localPut, accountKey } from '../src/utils/localData'
import { createMistakePdf, loadMistakePrintFont } from '../src/utils/mistakePdf'
import { safeQuestionHtml } from '../src/utils/questionHtml'
import { importShare, accessShare, createShare } from '../src/api/share'
import { imagesToPdf } from '../src/utils/imagesToPdf'
import { useAuthStore } from '../src/stores/auth'
import { examNavigationQa } from './exam-navigation-qa'
import { examAutomationQa } from './exam-automation-qa'
import { recycleExportQa } from './recycle-export-qa'
import { appDownloadsQa } from './app-downloads-qa'
import { mistakeMathQa, mathPrintQuestion } from './mistake-math-qa'
import '../src/styles/windows.css'

export async function featureQa(check: (ok: boolean, message: string) => void, originals: File[]) {
  const realFetch = window.fetch.bind(window), stored = new Map<string,string>()
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i)!; stored.set(key, localStorage.getItem(key)!) }
  const response = (data: any) => new Response(JSON.stringify(data), {headers: {'Content-Type':'application/json'}})
  const rejects = async (fn: () => Promise<any>) => { try { await fn(); return false } catch { return true } }
  const base = 'http://sxz.api.zykj.org', user = 'QA_' + crypto.randomUUID()
  localStorage.setItem('apiBaseUrl',base); localStorage.setItem('userId',user); localStorage.setItem('token','TEST_ONLY_NOT_A_TOKEN')
  setActivePinia(createPinia()); const auth = useAuthStore(); auth.apiBaseUrl = base; auth.userId = user
  const key = accountKey()
  try {
    await examNavigationQa(check)
    await examAutomationQa(check, user)
    await recycleExportQa(check)
    await appDownloadsQa(check)
    let payload: any, fail = false
    window.fetch = async (_url, opts) => { payload = JSON.parse(aesDecrypt(String(opts?.body))); return response(fail ? {code:1,msg:'TEST rejected'} : {code:0,data:aesEncrypt(JSON.stringify({version:5}))}) }
    const note = {fileId:'TEST_ID',fileName:'旧名称',type:1,fileUrl:'https://fixture.invalid/note',parentId:'',version:4,shared:false,isRecycleBin:false,expirationTimeStamp:null,createTime:'old',noteList:[]}
    check(buildRenamePayload(note,' 新名称 ').fileName === '新名称', '笔记重命名保留服务端完整字段及空值')
    await renameNote(note,'新名称')
    check(payload.version === 4 && !('noteList' in payload) && !('createTime' in payload) && note.version === 5 && note.fileName === '新名称', '重命名 AES 正文与成功后版本更新')
    fail = true; check(await rejects(() => renameNote(note,'不应更新')) && note.fileName === '新名称', '服务端拒绝重命名时不伪报成功')
    fail = false; await moveNotesToRecycleBin(['TEST_ID','TEST_ID_2'])
    check(Array.isArray(payload) && payload.join(',') === 'TEST_ID,TEST_ID_2', '回收站接口使用加密 ID 数组')
    const nodes = [{...note,fileName:'服务端新名称',version:7}, {...note,fileId:'TEST_ID_2',version:8}, {...note,fileId:'SAME',parentId:'DEST'}, {...note,fileId:'DEST',type:0,parentId:'0'}]
    let moveWrites:any[] = [], movedProgress:number[] = [], switchMove = false
    window.fetch = async (u,opts) => {
      if (String(u).endsWith('GetAll')) { if (switchMove) localStorage.setItem('userId',user+'_other'); return response({code:0,data:aesEncrypt(JSON.stringify({noteList:nodes}))}) }
      const body=JSON.parse(aesDecrypt(String(opts?.body))); moveWrites.push(body)
      return response(body.fileId === 'TEST_ID_2' ? {code:1,msg:'TEST conflict'} : {code:0})
    }
    const moveResult = await moveNotesToFolder(['TEST_ID','TEST_ID','TEST_ID_2','SAME','MISSING'],'DEST',{onProgress:n=>movedProgress.push(n)})
    check(moveResult.moved.join() === 'TEST_ID' && moveResult.skipped.join() === 'SAME' && moveResult.failed.length === 2 && movedProgress.join() === '1,2,3,4', '批量移动逐条报告成功、已在目录和失败；去重与进度正确')
    check(moveWrites.length===2 && moveWrites[0].parentId==='DEST' && moveWrites[0].fileName==='服务端新名称' && moveWrites[0].version===7 && moveWrites[0].expirationTimeStamp===null, '移动只更换目录，保留最新名称、服务端版本及空字段')
    check(await rejects(()=>moveNotesToFolder(['TEST_ID'],'MISSING')), '目标目录不存在时不写入')
    switchMove = true; const writesBeforeSwitch=moveWrites.length
    check(await rejects(()=>moveNotesToFolder(['TEST_ID'],'DEST')) && moveWrites.length===writesBeforeSwitch, '批量移动读取期间切换账号，不发出后续写入')
    localStorage.setItem('userId',user)
    window.fetch = async (_url,opts) => { payload = JSON.parse(String(opts?.body)); return response({success:true,result:{items:[],totalCount:0}}) }
    await searchMistakes('book',200,200)
    check(payload.skipCount === 200 && payload.maxResultCount === 200, '官方错题分页传入偏移，超过一页仍可导出')
    await getExamTasks(2)
    check(payload.taskListType===4 && payload.skipCount===20, '已完成作业使用官方 CompletedTask=4 类型和正确分页')
    let url = '', headers: any
    window.fetch = async (u,opts) => { url = String(u); headers = opts?.headers; return new Response('<div class="stem">题干</div>') }
    await fetchQstHtml('/Question/View/1?x=2')
    check(new URL(url).searchParams.get('x') === '2' && new URL(url).searchParams.get('showAnalysis') === 'true', '题目已有查询参数正确保留')
    await fetchQstHtml('https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/q.html')
    check(!headers.Authorization, '读取外部题干不转发账号 Token')
    const wrong = {id:11,originScore:2,myScore:10,score:10,completed:false,number:'1'}
    const task = {enableScore:true,examId:991,examName:'QA 数学测评',topicName:'数学',groups:[{questions:[wrong,{id:12,originScore:10,score:10},{id:13,originScore:null,myScore:0,score:10},{id:14,score:10}]}]}
    let analysis = {testGroupAnalysis:[{testQuestionAnalysis:[{questionId:11,errorStudents:[user]},{questionId:12,errorCount:20,errorStudents:['OTHER']},{questionId:13,errorStudents:[]},{questionId:14,childrenAnalysis:[{questionId:140,errorStudents:['OTHER']}]}]}]}
    check(analysisWrongQuestions(task,analysis,user).questions.map(q=>q.id).join() === '11', '题目分析只收登录用户错题，不误收其他学生或班级失分题')
    check(analysisWrongQuestions({...task,enableScore:false},analysis,user).questions.length===1, '识别依据题目分析，不受订正得分与分数公布开关影响')
    check(analysisWrongQuestions(task,{testGroupAnalysis:[{testQuestionAnalysis:[{questionId:14,childrenAnalysis:[{number:'(1)',errorStudents:[user]}]}]}]},user).questions[0].id===14, '子题错误可映射到所属主问题')
    check(analysisWrongQuestions(task,{testGroupAnalysis:[{testQuestionAnalysis:[{questionId:999,errorStudents:[user]}]}]},user).unmatched===1, '未知题目 ID 不按题号猜测导入')
    await saveExamReview(77,task,analysis,key)
    let membership = true, posts = 0, rejectAdd = false, ambiguous = false, switchAccount = false
    window.fetch = async (u,opts) => {
      const address = String(u)
      if (address.includes('GetExamTaskAsync')) { if (switchAccount) localStorage.setItem('userId',user+'_other'); return response({success:true,result:task}) }
      if (address.includes('GetQuestionAnalysisAsync')) return response({success:true,result:analysis})
      if (address.includes('GetQuestionViewAsync')) return response({success:true,result:{path:'/Question/View/11',isInMistakeBook:membership}})
      if (address.includes('GetRelatedQstViewAsync')) return response({success:true,result:[{path:'/Question/View/11',isInMistakeBook:membership},{path:'/Question/View/11',isInMistakeBook:membership}]})
      if (address.includes('/Question/View/11')) return new Response('<div class="stem"><p>1 + 1 = ?</p></div><div class="answers">2</div><div class="analysis">加法</div>')
      if (address.includes('AddInMistakeBookAsync')) { posts++; payload = JSON.parse(String(opts?.body)); if (rejectAdd) return response({success:false,error:{message:'TEST rejected'}}); membership=true; if (ambiguous) throw new Error('TEST response lost'); return response({success:true,result:null}) }
      throw new Error('Unexpected QA network: '+address)
    }
    await syncExamMistakes(77,key)
    check(posts === 0 && (await listLocalMistakes(key))[0].sync === 'synced', '官方已有错题只记同步状态，不重复新增')
    const entries = await listLocalMistakes(key); entries[0].stemShoot='https://fixture.invalid/stem.png'; entries[0].sync='pending'; await localPut('mistakes|'+key,entries)
    membership=false; rejectAdd=true; await syncExamMistakes(77,key)
    check((await listLocalMistakes(key))[0].sync === 'pending' && !!(await listLocalMistakes(key))[0].syncError, 'HTTP 200 业务失败保留待同步记录')
    rejectAdd=false; ambiguous=true; await syncExamMistakes(77,key)
    const beforeRetry=posts; await syncExamMistakes(77,key)
    check(posts === beforeRetry && (await listLocalMistakes(key)).length === 1 && (await listLocalMistakes(key))[0].sync === 'synced' && !(await listLocalMistakes(key))[0].syncError, '丢失响应后重试检查官方状态，去重并清除旧错误')
    check(payload.examId === 991 && payload.questionId === 11 && payload.isRelatedGroup === false && payload.stemShoot.endsWith('stem.png') && Array.isArray(payload.extraStems) && Array.isArray(payload.tagIdList), '新增错题正文遵循官方学生 APK 合约')
    switchAccount=true; const beforeSwitch=posts
    check(await rejects(() => syncExamMistakes(77,key)) && posts === beforeSwitch, '账号切换阻止继续官方写入')
    check((await listLocalMistakes()).length === 0, '本地错题按服务器和账号隔离')
    localStorage.setItem('userId',user)
    switchAccount=false; ambiguous=false; membership=false; task.examId=992
    task.groups=[{questions:[{...wrong,id:21,answerByGroup:true,relatedGroupId:100},{...wrong,id:22,answerByGroup:true,relatedGroupId:100}]}] as any
    analysis={testGroupAnalysis:[{testQuestionAnalysis:[{questionId:21,errorStudents:[user]},{questionId:22,errorStudents:[user]}]}]} as any
    await saveExamReview(77,task,analysis,key)
    const relatedEntries=await listLocalMistakes(key)
    relatedEntries.push({...relatedEntries[0],id:'local:992:group:100',examId:992,questionId:100,isRelatedGroup:true,sync:'pending'})
    await localPut('mistakes|'+key,relatedEntries)
    const beforeRelated=posts; await syncExamMistakes(77,key)
    check(posts===beforeRelated+1 && payload.questionId===100 && payload.isRelatedGroup===true, '关联题组使用 groupId，组内多个失分题只同步一次')
    const noReviewPosts=posts
    check(await rejects(()=>syncExamMistakes(12345,key)) && posts===noReviewPosts, '未经题目分析审核的作业不自动写入官方错题本')
    const embedUrl = new URL(officialEmbedUrl('http://sxz.school.zykj.org/','http://sxz.api.zykj.org','TEST_TOKEN+&?','course'))
    check(embedUrl.pathname==='/index.html' && embedUrl.searchParams.get('apiToken')==='TEST_TOKEN+&?' && embedUrl.hash==='#/index/courseChoosing/StudentsCoursesList', '选课入口正确编码 Token、消除重复斜线并保留官方路由')
    const bootstrap = officialUserBootstrap({id:user,realName:'QA'},'http://sxz.school.zykj.org')
    check(bootstrap.includes('location.origin') && bootstrap.includes('sessionStorage.setItem') && !bootstrap.includes(user), '选课预加载官方加密学生资料，脚本仅在学校网页源生效')
    const uploadJobs:NoteUploadJob[] = [1,2,3].map(n=>({id:'stable-'+n,file:new File(['TEST'],'file'+n+'.pdf'),name:'笔记'+n,status:'pending',percent:0,error:''}))
    const calls:string[] = [], percents:number[] = []; let failSecond = true, concurrent = 0, maxConcurrent = 0
    const uploadQueue = () => runNoteUploadQueue(uploadJobs,{isActive:()=>true,shouldStop:()=>false,
      upload:async(job,progress)=>{concurrent++; maxConcurrent=Math.max(maxConcurrent,concurrent); calls.push(job.id); progress(5,'TEST'); await Promise.resolve(); concurrent--; if(job.id==='stable-2' && failSecond) throw new Error('TEST rejected'); progress(100,'TEST'); return true},
      onProgress:p=>percents.push(p)})
    const batch=await uploadQueue()
    check(batch.saved===2 && batch.failed===1 && maxConcurrent===1 && uploadJobs[0].status==='success' && uploadJobs[2].status==='success', '多 PDF 队列逐个处理，单个失败不阻止后续文件')
    check(percents.at(-1)===100 && percents.every((p,i)=>i===0 || p>=percents[i-1]), '批量上传总体进度单调递增并完成到 100%')
    failSecond=false; await uploadQueue()
    check(calls.join()==='stable-1,stable-2,stable-3,stable-2' && uploadJobs.every(job=>job.status==='success'), '失败重试保留原文件 ID，不重复提交成功文件')
    let stopAfterFirst = false
    for(const job of uploadJobs) job.status='pending'
    const stopped = await runNoteUploadQueue(uploadJobs,{isActive:()=>true,shouldStop:()=>stopAfterFirst,upload:async()=>{stopAfterFirst=true;return true}})
    check(stopped.processed===1 && stopped.stopped && uploadJobs[1].status==='pending', '停止后续文件会完成当前文件并保留待上传队列')

    const malicious='<p onclick="alert(1)">保留<script>alert(1)</script><img src="javascript:alert(1)"><b>数学</b></p>'
    const cleaned=safeQuestionHtml(malicious)
    check(cleaned.includes('数学') && !/script|onclick|javascript:/i.test(cleaned), '题目导入只保留被动 HTML 和安全图片')
    const shareFile = new File([JSON.stringify({format:'aoki-share',version:1,info:{resource_type:'mistake',title:'TEST'},content:{stem:malicious}})],'TEST.zytbshare')
    const imported=await accessShare(await importShare(shareFile))
    check(!/script|onclick|javascript:/i.test(imported.stem), '离线分享导入后同样清理主动内容')
    window.fetch = async (u) => String(u).includes('GetMistakeQstItemDetailInfoAsync') ? response({result:{qstPath:'/Question/View/11'}}) : new Response('<div class="stem">密码测试题</div>')
    const encrypted = await createShare({api_base:base,resource_type:'mistake',resource_id:'11',title:'QA',password:'TEST_PASSWORD'})
    check(await rejects(() => accessShare(encrypted.share_id,'WRONG')), '本地分享密码错误拒绝解密')
    check((await accessShare(encrypted.share_id,'TEST_PASSWORD')).stem.includes('密码测试题'), 'AES-GCM 本地加密分享正确密码可读取')

    const manual=await imagesToPdf([originals[0],originals[0],originals[0],originals[0]],'manual',undefined,undefined,[0,1,2,3])
    const manualDoc=await PDFDocument.load(await manual.arrayBuffer())
    check(manualDoc.getPages().map(p=>p.getRotation().angle).join(',') === '0,270,180,90', '手动角度 0/逆时针90/180/270 保留，不二次自动旋转')
    window.fetch=realFetch
    await mistakeMathQa(check)
    const fontCanvas=document.createElement('canvas'), fontContext=fontCanvas.getContext('2d')!
    await loadMistakePrintFont()
    fontContext.font='16.28px "Aoki PDF Song"'; const songWidth=fontContext.measureText('数学 WWWiii 0123456789').width
    fontContext.font='16.28px sans-serif'; const sansWidth=fontContext.measureText('数学 WWWiii 0123456789').width
    check(Math.abs(songWidth-sansWidth) > .5, '随包思源宋体实际载入，PDF 不退回默认黑体')
    const pdf=await createMistakePdf('数学',[mathPrintQuestion,{title:'分式与图形',stem:'<p>解答：x² + y² = 1，请写出完整过程。</p><table><tr><td>条件</td><td>结果</td></tr><tr><td>x = 0</td><td>y = 1</td></tr></table>',answer:'<p>答案：圆。</p>'},{title:'长题分页完整性',stem:Array.from({length:70},(_,i)=>`<p>第 ${i+1} 行：数学题干与推导，不能遗漏。</p>`).join('')+'<p>END_MARKER_70</p>'}])
    const pdfDoc=await PDFDocument.load(await pdf.arrayBuffer())
    check(pdfDoc.getPageCount() >= 3 && pdfDoc.getPages().every(p=>Math.abs(p.getWidth()-595.28)<.01), '中文题干、表格和超长题导出 A4 多页 PDF')
    const host=(window as any).nativeHost
    if(host) await host.saveFile(await pdf.arrayBuffer(),'qa-mistakes.pdf')
    return pdf
  } finally {
    window.fetch=realFetch
    localStorage.clear(); for(const [k,v] of stored) localStorage.setItem(k,v)
  }
}

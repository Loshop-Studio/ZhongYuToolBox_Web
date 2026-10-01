import { createPinia, setActivePinia } from 'pinia'
import { PDFDocument } from 'pdf-lib'
import { aesEncrypt, aesDecrypt } from '../src/utils/crypto'
import { buildRenamePayload, renameNote, moveNotesToRecycleBin } from '../src/api/note'
import { searchMistakes, fetchQstHtml } from '../src/api/mistake'
import { gradedWrongQuestions, syncExamMistakes, listLocalMistakes } from '../src/utils/examMistakes'
import { localPut, accountKey } from '../src/utils/localData'
import { createMistakePdf } from '../src/utils/mistakePdf'
import { safeQuestionHtml } from '../src/utils/questionHtml'
import { importShare, accessShare, createShare } from '../src/api/share'
import { imagesToPdf } from '../src/utils/imagesToPdf'
import { useAuthStore } from '../src/stores/auth'
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
    let payload: any, fail = false
    window.fetch = async (_url, opts) => { payload = JSON.parse(aesDecrypt(String(opts?.body))); return response(fail ? {code:1,msg:'TEST rejected'} : {code:0,data:aesEncrypt(JSON.stringify({version:5}))}) }
    const note = {fileId:'TEST_ID',fileName:'旧名称',type:1,fileUrl:'https://fixture.invalid/note',parentId:'',version:4,shared:false,isRecycleBin:false,expirationTimeStamp:null,createTime:'old',noteList:[]}
    check(buildRenamePayload(note,' 新名称 ').fileName === '新名称', '笔记重命名保留服务端完整字段及空值')
    await renameNote(note,'新名称')
    check(payload.version === 4 && !('noteList' in payload) && !('createTime' in payload) && note.version === 5 && note.fileName === '新名称', '重命名 AES 正文与成功后版本更新')
    fail = true; check(await rejects(() => renameNote(note,'不应更新')) && note.fileName === '新名称', '服务端拒绝重命名时不伪报成功')
    fail = false; await moveNotesToRecycleBin(['TEST_ID','TEST_ID_2'])
    check(Array.isArray(payload) && payload.join(',') === 'TEST_ID,TEST_ID_2', '回收站接口使用加密 ID 数组')
    window.fetch = async (_url,opts) => { payload = JSON.parse(String(opts?.body)); return response({success:true,result:{items:[],totalCount:0}}) }
    await searchMistakes('book',200,200)
    check(payload.skipCount === 200 && payload.maxResultCount === 200, '官方错题分页传入偏移，超过一页仍可导出')
    let url = '', headers: any
    window.fetch = async (u,opts) => { url = String(u); headers = opts?.headers; return new Response('<div class="stem">题干</div>') }
    await fetchQstHtml('/Question/View/1?x=2')
    check(new URL(url).searchParams.get('x') === '2' && new URL(url).searchParams.get('showAnalysis') === 'true', '题目已有查询参数正确保留')
    await fetchQstHtml('https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/q.html')
    check(!headers.Authorization, '读取外部题干不转发账号 Token')
    const wrong = {id:11,originScore:2,myScore:10,score:10,completed:false,number:'1'}
    const task = {enableScore:true,examId:991,examName:'QA 数学测评',topicName:'数学',groups:[{questions:[wrong,{id:12,originScore:10,score:10},{id:13,originScore:null,myScore:0,score:10},{id:14,score:10}]}]}
    check(gradedWrongQuestions(task).length === 1 && gradedWrongQuestions({...task,enableScore:false}).length === 0, '公布原始分数判断失分题，不误收未评分及订正后满分')
    let membership = true, posts = 0, rejectAdd = false, ambiguous = false, switchAccount = false
    window.fetch = async (u,opts) => {
      const address = String(u)
      if (address.includes('GetExamTaskAsync')) { if (switchAccount) localStorage.setItem('userId',user+'_other'); return response({success:true,result:task}) }
      if (address.includes('GetQuestionViewAsync')) return response({success:true,result:{path:'/Question/View/11',isInMistakeBook:membership}})
      if (address.includes('GetRelatedQstViewAsync')) return response({success:true,result:[{path:'/Question/View/11',isInMistakeBook:membership},{path:'/Question/View/11',isInMistakeBook:membership}]})
      if (address.includes('/Question/View/11')) return new Response('<div class="stem"><p>1 + 1 = ?</p></div><div class="answers">2</div><div class="analysis">加法</div>')
      if (address.includes('AddInMistakeBookAsync')) { posts++; payload = JSON.parse(String(opts?.body)); if (rejectAdd) return response({success:false,error:{message:'TEST rejected'}}); membership=true; if (ambiguous) throw new Error('TEST response lost'); return response({success:true,result:null}) }
      throw new Error('Unexpected QA network: '+address)
    }
    await syncExamMistakes(77,key)
    check(posts === 0 && (await listLocalMistakes(key))[0].sync === 'synced', '官方已有错题只保存本地，不重复新增')
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
    const relatedEntries=await listLocalMistakes(key)
    relatedEntries.push({...relatedEntries[0],id:'local:992:group:100',examId:992,questionId:100,isRelatedGroup:true,sync:'pending'})
    await localPut('mistakes|'+key,relatedEntries)
    const beforeRelated=posts; await syncExamMistakes(77,key)
    check(posts===beforeRelated+1 && payload.questionId===100 && payload.isRelatedGroup===true, '关联题组使用 groupId，组内多个失分题只同步一次')

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
    const pdf=await createMistakePdf('数学',[{title:'分式与图形',stem:'<p>解答：x² + y² = 1，请写出完整过程。</p><table><tr><td>条件</td><td>结果</td></tr><tr><td>x = 0</td><td>y = 1</td></tr></table>',answer:'<p>答案：圆。</p>'},{title:'长题分页完整性',stem:Array.from({length:70},(_,i)=>`<p>第 ${i+1} 行：数学题干与推导，不能遗漏。</p>`).join('')+'<p>END_MARKER_70</p>'}])
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

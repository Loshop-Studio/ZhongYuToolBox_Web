import { detectExamReview, recognizeExamTasks } from '../src/utils/examAutoReview'
import { getExamReview } from '../src/utils/examReview'
import { removeMistakeItems } from '../src/api/mistake'
import { accountKey } from '../src/utils/localData'

export async function examAutomationQa(check: (ok:boolean,message:string)=>void, user:string) {
  const previousFetch = window.fetch, key = accountKey()
  const response = (data:any) => new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})
  const rejects = async (fn:()=>Promise<any>) => {try{await fn();return false}catch{return true}}
  const calls: {url:string;method:string;body:any}[]=[]
  let failDelete=false, abortOnDetail:AbortController|undefined, switchOnDetail=false
  window.fetch=async (url,options) => {
    const address=new URL(String(url)); calls.push({url:address.pathname,method:options?.method||'GET',body:options?.body?JSON.parse(String(options.body)):null})
    if(address.pathname.endsWith('MultiRemoveMistakeItemsAsync')) return response(failDelete?{success:false,error:{message:'QA rejected'}}:{success:true,result:null})
    if(address.pathname.endsWith('GetExamTaskAsync')) {
      const id=Number(address.searchParams.get('id'))
      if(abortOnDetail)abortOnDetail.abort()
      if(switchOnDetail)localStorage.setItem('userId',user+'_other')
      return response({success:true,result:{examId:id===300?undefined:id+900,groups:[{questions:[{id:501,number:1},{id:502,number:2}]}]}})
    }
    const examId=Number(address.searchParams.get('examId'))
    return response(examId===1202?{success:false,error:{message:'QA analysis unavailable'}}:{success:true,result:{testGroupAnalysis:[{testQuestionAnalysis:[{questionId:501,number:1,errorStudents:[user]},{questionId:502,number:2,errorStudents:['OTHER_STUDENT']}]}]}})
  }
  try {
    const states:Record<number,string>={}, progress:number[]=[]
    await recognizeExamTasks([301,302,301,303],key,new AbortController().signal,(id,state)=>states[id]=state.status,n=>progress.push(n))
    check(calls.length===6 && calls.every(c=>c.method==='GET') && progress.join()==='1,2,3', '自动识别按队列读取详情与分析，去重且不向官方写入')
    check(states[301]==='ready' && states[302]==='error' && states[303]==='ready', '单个作业识别失败不阻止后续作业，保留独立重试状态')
    check(getExamReview(301,key)?.questionIds.join()==='501' && getExamReview(303,key)?.questionIds.join()==='501', '自动识别结果直接供列表导入，只收当前学生错题')
    const beforeBad=calls.length
    check(await rejects(()=>detectExamReview(300,key)) && calls.length===beforeBad+1, '缺少 examId 的作业不发送分析请求')
    abortOnDetail=new AbortController();const beforeAbort=calls.length
    check(await rejects(()=>recognizeExamTasks([304,305],key,abortOnDetail!.signal,()=>{},()=>{})) && calls.length===beforeAbort+1 && !getExamReview(304,key), '离开页面取消自动识别，不发出后续请求或写入审核结果')
    abortOnDetail=undefined; switchOnDetail=true;const beforeSwitch=calls.length
    check(await rejects(()=>detectExamReview(306,key)) && calls.length===beforeSwitch+1, '读取作业期间切换账号，停止分析和结果保存')
    switchOnDetail=false; localStorage.setItem('userId',user)
    const removed=await removeMistakeItems('7',['11',11,12])
    const deletion=calls[calls.length-1]
    check(removed.join()==='11,12' && deletion.url.endsWith('MultiRemoveMistakeItemsAsync') && deletion.method==='POST' && JSON.stringify(deletion.body)==='{"bookId":7,"itemIds":[11,12]}', '官方删除使用错题本 ID 与去重的条目 ID，遵循 APK JSON 合约')
    failDelete=true
    check(await rejects(()=>removeMistakeItems(7,[11])), '官方 HTTP 200 业务拒绝删除时不返回成功')
    const beforeInvalid=calls.length, canceled=new AbortController();canceled.abort()
    check(await rejects(()=>removeMistakeItems(7,[])) && await rejects(()=>removeMistakeItems('NaN',[11])) && await rejects(()=>removeMistakeItems(7,[0])) && await rejects(()=>removeMistakeItems(7,[11],canceled.signal)) && calls.length===beforeInvalid, '空选择、无效编号和取消删除不发送请求')
  } finally {window.fetch=previousFetch;localStorage.setItem('userId',user)}
}

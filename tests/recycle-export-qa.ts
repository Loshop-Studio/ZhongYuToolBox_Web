import { aesEncrypt, aesDecrypt } from '../src/utils/crypto'
import { getRecycledNotes, deleteRecycledNotes } from '../src/api/note'
import { mistakePdfSections } from '../src/utils/mistakePdf'
export async function recycleExportQa(check: (ok:boolean,message:string)=>void) {
  const original = window.fetch, calls: {url:string;body:any}[]=[]
  const note = {fileId:'RECYCLED',fileName:'回收站笔记',type:1,isRecycleBin:true}
  let fail = false
  window.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(aesDecrypt(String(options.body))) : null
    calls.push({url:String(url),body})
    return new Response(JSON.stringify(String(url).endsWith('GetAll') ? {code:0,data:aesEncrypt(JSON.stringify({noteList:[note,{...note,fileId:'LIVE',isRecycleBin:false},{...note,fileId:'FOLDER',type:0}]}))} : fail ? {code:1001,msg:'QA rejected'} : {code:0}))
  }
  const rejected = async(fn:()=>Promise<any>) => {try{await fn();return false}catch{return true}}
  try {
    check((await getRecycledNotes()).map(n=>n.fileId).join()==='RECYCLED','云笔记回收站只列回收站笔记，不混入正常笔记和文件夹')
    await deleteRecycledNotes(['RECYCLED','RECYCLED'])
    check(calls.at(-1)!.url.endsWith('/Notes/Delete') && JSON.stringify(calls.at(-1)!.body)==='["RECYCLED"]','永久删除使用官方 AES ID 数组并去重')
    const before = calls.filter(c=>c.body).length
    check(await rejected(()=>deleteRecycledNotes(['LIVE'])) && calls.filter(c=>c.body).length===before,'重新读取回收站状态，正常笔记不能永久删除')
    fail = true; check(await rejected(()=>deleteRecycledNotes(['RECYCLED'])),'永久删除业务失败不能报告成功')
    const c = new AbortController();c.abort();const count = calls.length
    check(await rejected(()=>deleteRecycledNotes(['RECYCLED'],c.signal)) && calls.length===count,'取消永久删除后不继续读写官方接口')
    const questions = [{title:'第一题',stem:'STEM_1',answer:'ANSWER_1',analysis:'ANALYSIS_1'},{title:'第二题',stem:'STEM_2'}]
    const sections = mistakePdfSections('数学',questions,true)
    check(sections.length===2 && sections[0].questions.map(q=>q.title).join()==='1. 第一题,2. 第二题' && !JSON.stringify(sections[0]).includes('ANSWER_1'),'全部题目在前连续编号，不泄漏答案到练习区')
    check(sections[1].questions[0].title==='1. 第一题' && sections[1].questions[0].stem.includes('ANSWER_1') && sections[1].questions[0].stem.includes('ANALYSIS_1') && sections[1].questions[1].stem.includes('官方未提供'),'独立答案区题号对应，缺失答案明确标示')
    check(mistakePdfSections('数学',questions,false).length===1,'不附答案时仅导出题目部分')
  } finally {window.fetch=original}
}

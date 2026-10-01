export interface NoteUploadJob {
  id:string; file:File; name:string; status:'pending'|'uploading'|'success'|'failed'; percent:number; error:string
}
/** One PDF is rendered/uploaded at a time. Successes are never replayed on retry. */
export async function runNoteUploadQueue<T>(jobs:NoteUploadJob[], options:{
  isActive:()=>boolean; shouldStop:()=>boolean
  upload:(job:NoteUploadJob, progress:(percent:number,text:string)=>void)=>Promise<T>
  onProgress?:(percent:number,text:string)=>void
  onResult?:(job:NoteUploadJob,result:T)=>void
}) {
  const pending = jobs.filter(job => job.status !== 'success'), total = pending.length
  const ensure = () => { if (!options.isActive()) throw new Error('账号或学校已变更，批量上传已停止') }
  let processed = 0, saved = 0
  for (const job of pending) {
    ensure(); if (options.shouldStop()) break
    job.status = 'uploading'; job.percent = 0; job.error = ''
    try {
      if (!job.name.trim()) throw new Error('笔记名称不能为空')
      const result = await options.upload(job,(percent,text)=>{
        job.percent = Math.max(job.percent,Math.min(100,Math.max(0,percent)))
        options.onProgress?.(Math.floor((processed + job.percent / 100) / total * 100),`${processed + 1}/${total} · ${job.file.name}：${text}`)
      })
      ensure(); job.percent = 100; job.status = 'success'; saved++; options.onResult?.(job,result)
    } catch(error) { job.status = 'failed'; job.error = (error as Error).message; ensure() }
    processed++
    options.onProgress?.(Math.floor(processed / total * 100),`已处理 ${processed}/${total} 个文件，本次成功 ${saved} 个`)
  }
  return { processed, saved, failed:pending.filter(job=>job.status==='failed').length, stopped:processed < total }
}

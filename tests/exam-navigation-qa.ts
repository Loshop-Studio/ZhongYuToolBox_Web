import { createApp, defineComponent, h, KeepAlive, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useExamDetailLoad } from '../src/composables/useExamDetailLoad'
import { getExamTask, getExamOverview, getQuestionAnalysis, getQstAnswerView, exportObjectiveAnswers, parseExamQuestions } from '../src/api/exam'

export async function examNavigationQa(check: (ok: boolean, message: string) => void) {
  const savedFetch = window.fetch
  let requests = 0
  window.fetch = async () => { requests++; return new Response('{}') }
  try {
    for (const api of [getExamTask, getExamOverview, getQuestionAnalysis, getQstAnswerView, exportObjectiveAnswers]) {
      for (const id of [NaN, Infinity, 0, -1, 1.5]) {
        let rejected = false
        try { await api(id) } catch { rejected = true }
        if (!rejected) throw new Error('Invalid ID accepted')
      }
    }
    check(requests === 0, '所有测评详情接口在发送请求前拒绝 NaN、无限值、非正整数')
    const parsing = new AbortController(); let htmlReads = 0
    let rejected = false
    try {
      await parseExamQuestions({groups:[{questions:[{id:11},{id:12}]}]}, async () => {
        htmlReads++; parsing.abort(); return '<div class="stem">late response</div>'
      }, parsing.signal)
    } catch { rejected = true }
    check(rejected && htmlReads === 1, '离开试题页后中止解析，不继续读取后续题目')
  } finally { window.fetch = savedFetch }

  const calls: {page:string; id:number; signal:AbortSignal; current:()=>boolean; resolve:()=>void; reject:()=>void}[] = []
  const committed: number[] = [], errors: any[] = []
  const page = (pageName:string) => defineComponent({name:pageName, setup() {
    useExamDetailLoad(pageName, async ctx => {
      await new Promise<void>((resolve, reject) => calls.push({page:pageName,id:ctx.id,signal:ctx.signal,current:ctx.isCurrent,resolve,reject:()=>reject(new Error('late error'))}))
      if (ctx.isCurrent()) committed.push(ctx.id)
    }, error => errors.push(error))
    return () => h('div', pageName)
  }})
  const router = createRouter({history:createMemoryHistory(), routes:[
    {path:'/exam',name:'exam',component:defineComponent({render:()=>h('div','list')})},
    {path:'/exam/:taskId',name:'exam-questions',component:page('exam-questions')},
    {path:'/exam/:taskId/overview',name:'exam-overview',component:page('exam-overview')},
    {path:'/exam/:taskId/analysis',name:'exam-analysis',component:page('exam-analysis')}
  ]})
  const root = document.createElement('div'); document.body.appendChild(root)
  const app = createApp({render:()=>h(RouterView, {}, {default:({Component}:any)=>h(KeepAlive,{},()=>Component ? h(Component) : null)})})
  app.use(router)
  const settle = async () => { await nextTick(); await new Promise(resolve=>setTimeout(resolve,0)) }
  try {
    await router.push('/exam/77'); await router.isReady(); app.mount(root); await settle()
    check(calls.length === 1 && calls[0].id === 77, '首次进入缓存试题页只加载一次')
    calls[0].resolve(); await settle()
    await router.push('/exam/77/analysis'); await settle()
    check(calls.length === 2 && calls[0].signal.aborted, '试题切换分析时取消试题页请求')
    await router.push('/exam'); await settle()
    const returnedCount = calls.length
    calls[1].reject(); await settle()
    check(returnedCount === 2 && calls[1].signal.aborted && errors.length === 0, '分析返回新测评不再加载详情，忽略退出后的失败')
    await router.push('/exam/78/overview'); await settle()
    const oldOverview = calls[calls.length-1]
    await router.push('/exam/79/overview'); await settle()
    oldOverview.resolve(); await settle()
    check(oldOverview.signal.aborted && !committed.includes(78) && calls[calls.length-1].id === 79, '复用概览页切换作业，迟到响应不覆盖新作业')
    calls[calls.length-1].resolve(); await settle()
    await router.push('/exam/80'); await settle()
    const lateQuestions = calls[calls.length-1]
    await router.push('/exam'); await settle(); lateQuestions.resolve(); await settle()
    check(!committed.includes(80) && !lateQuestions.current(), '返回列表后的题目响应不更新缓存页面')
    await router.push('/exam/81/analysis'); await settle()
    const newAnalysis = calls[calls.length-1]
    check(newAnalysis.id === 81 && !newAnalysis.signal.aborted, '再次进入缓存分析页加载当前作业')
    const beforeInvalid = calls.length
    await router.push('/exam/NaN'); await settle()
    await router.push('/exam/0/overview'); await settle()
    await router.push('/exam/invalid/analysis'); await settle()
    check(calls.length === beforeInvalid && calls.every(c=>Number.isSafeInteger(c.id) && c.id > 0), '三个缓存详情页均拒绝缺失或无效任务编号')
  } finally { app.unmount(); root.remove(); calls.forEach(c=>c.resolve()); await settle() }
}

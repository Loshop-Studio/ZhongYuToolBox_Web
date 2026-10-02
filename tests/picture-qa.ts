import { createApp, nextTick } from 'vue'
import { getActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import PictureView from '../src/views/PictureView.vue'

export async function pictureQa(check: (ok: boolean, message: string) => void) {
  const original = window.fetch, container = document.createElement('div')
  document.body.appendChild(container)
  let normal = [101, 102], recycle = [201, 202], fail = false
  const writes: { method: string; url: URL; body: unknown }[] = []
  let application: ReturnType<typeof createApp> | undefined
  const wait = async (predicate: () => boolean) => {
    const deadline = Date.now() + 10000
    while (!predicate() && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 25)); await nextTick() }
    if (!predicate()) throw new Error('图库界面 QA 超时')
  }
  const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent!.trim().startsWith(label))!
  const choose = (id: number) => container.querySelector<HTMLInputElement>(`[aria-label="选择${recycle.includes(id) ? '回收站' : ''}图片 QA_${id}"]`)!.click()
  const confirm = async (accept: boolean) => {
    await wait(() => !!document.querySelector('.el-message-box'))
    const buttons = document.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button')
    buttons[accept ? buttons.length - 1 : 0].click()
    await wait(() => !document.querySelector('.el-message-box'))
  }
  try {
    window.fetch = async (input, options) => {
      const url = new URL(String(input)), method = options?.method || 'GET'
      let result: unknown = null
      if (url.pathname.endsWith('GetAllPicturesFromLibrary')) {
        const ids = url.searchParams.get('IsRecycleBin') === 'true' ? recycle : normal
        result = { items: ids.map(id => ({ id, name: `QA_${id}`, picture: '', size: '1 KB', createTime: 'QA' })), totalCount: ids.length }
      } else {
        const body = options?.body ? JSON.parse(String(options.body)) : undefined
        writes.push({ method, url, body })
        if (fail) return new Response(JSON.stringify({ success: false, error: { message: 'QA rejected' } }))
        const ids = method === 'DELETE' ? url.searchParams.getAll('ids').map(Number) : body as number[]
        if (url.pathname.endsWith('MoveToRecycleBinAsync')) { normal = normal.filter(id => !ids.includes(id)); recycle.push(...ids) }
        else if (url.pathname.endsWith('RecoverPictureFromRecycleBinAsync')) { recycle = recycle.filter(id => !ids.includes(id)); normal.push(...ids) }
        else if (url.pathname.endsWith('DeletePicture')) recycle = recycle.filter(id => !ids.includes(id))
        else throw new Error('Unexpected gallery QA request: ' + url.pathname)
      }
      return new Response(JSON.stringify({ success: true, result }))
    }
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
    await router.push('/'); await router.isReady()
    application = createApp(PictureView); application.use(getActivePinia()!); application.use(router); application.use(ElementPlus); application.mount(container)
    await wait(() => !!container.querySelector('[aria-label="选择图片 QA_101"]') && !!container.querySelector('[aria-label="选择回收站图片 QA_202"]'))
    choose(101); await nextTick()
    check(button('移至回收站').textContent!.includes('1') && !button('移至回收站').disabled, '图库复选框正确绑定所选图片编号与数量')
    button('移至回收站').click(); await confirm(false)
    await wait(() => !button('移至回收站').disabled)
    check(writes.length === 0 && button('移至回收站').textContent!.includes('1'), '取消图库确认不发送写入，保留选择')
    button('移至回收站').click(); await confirm(true)
    await wait(() => writes.length === 1 && !container.querySelector('[aria-label="选择图片 QA_101"]') && !button('刷新').disabled)
    check(writes[0].method === 'POST' && JSON.stringify(writes[0].body) === '[101]', '图库移入成功后重新加载，POST 正文使用实际数字 ID')
    container.querySelector<HTMLElement>('#tab-recycle')!.click()
    await nextTick(); choose(201); await nextTick(); fail = true
    button('永久删除').click(); await confirm(true)
    await wait(() => writes.length === 2 && !button('永久删除').disabled)
    check(!!container.querySelector('[aria-label="选择回收站图片 QA_201"]') && button('永久删除').textContent!.includes('1'), '图库永久删除被服务端拒绝时保留图片和选择')
    fail = false; button('永久删除').click(); await confirm(true)
    await wait(() => writes.length === 3 && !container.querySelector('[aria-label="选择回收站图片 QA_201"]'))
    check(writes[2].method === 'DELETE' && writes[2].url.searchParams.get('ids') === '201' && writes[2].body === undefined, '回收站永久删除使用 DELETE ids 查询且没有正文')
    await wait(() => !button('刷新').disabled)
    choose(202); await nextTick(); button('恢复选中').click(); await confirm(true)
    await wait(() => writes.length === 4 && !container.querySelector('[aria-label="选择回收站图片 QA_202"]'))
    check(writes[3].url.pathname.endsWith('RecoverPictureFromRecycleBinAsync') && normal.includes(202), '图库恢复后刷新两列表，图片回到正常图库')
  } finally { application?.unmount(); container.remove(); window.fetch = original }
}

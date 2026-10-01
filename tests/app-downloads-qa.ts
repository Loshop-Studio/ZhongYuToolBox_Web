import { createApp, nextTick } from 'vue'
import { getActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import JSZip from 'jszip'
import AppDownloadsView from '../src/views/AppDownloadsView.vue'
import { STUDENT_APPS } from '../src/api/appStore'

export async function appDownloadsQa(check: (ok: boolean, message: string) => void) {
  const original = window.fetch
  const container = document.createElement('div'); document.body.appendChild(container)
  const fixture = new JSZip(); fixture.file('AndroidManifest.xml', 'QA'); fixture.file('classes.dex', new Uint8Array(1024))
  const bytes = await fixture.generateAsync({ type: 'uint8array' })
  let canceled = false, slow = false, saving = false
  let application: ReturnType<typeof createApp> | undefined
  const wait = async (predicate: () => boolean) => {
    const deadline = Date.now() + 10000
    while (!predicate() && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 25)); await nextTick() }
    if (!predicate()) throw new Error('下载页 QA 超时')
  }
  const button = (text: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === text) as HTMLButtonElement
  try {
    window.fetch = async (input, options) => {
      const url = new URL(String(input))
      check(!new Headers(options?.headers).has('Authorization'), '应用公开查询和下载不传账号 Token')
      if (url.pathname.includes('CheckUpdateAsync')) {
        check(url.searchParams.get('appType') === '0', '下载页仅查询学生端版本')
        const known = STUDENT_APPS.find(app => app.packageName === url.searchParams.get('packageName'))
        return new Response(JSON.stringify({ success: true, result: known ? { ...known, size: bytes.length, versionCode: 1, versionName: 'QA', appType: 0, disabled: false, fileUrl: 'http://sxz.alicdn.zykj.org/qa.apk' } : null }))
      }
      if (url.pathname === '/qa.apk') {
        if (slow) return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => { canceled = true; reject(new DOMException('Canceled', 'AbortError')) }, { once: true })
        })
        saving = true
        return new Response(bytes as BodyInit)
      }
      throw new Error('Unexpected QA request: ' + url.pathname)
    }
    application = createApp(AppDownloadsView); application.use(getActivePinia()!); application.use(ElementPlus); application.mount(container)
    await wait(() => container.querySelectorAll('.app-card').length === 7 && !button('下载 APK')?.disabled)
    check(container.textContent!.includes('优课畅学') && container.textContent!.includes('vQA'), '真实 Vue 页面显示官方学生应用与版本')
    const search = container.querySelector<HTMLInputElement>('[aria-label="搜索中育应用"]')!
    search.value = '优课畅学'; search.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
    check(container.querySelectorAll('.app-card').length === 1, '下载页搜索只显示匹配应用')
    slow = true; button('下载 APK').click(); await wait(() => !!button('取消下载'))
    button('取消下载').click(); await wait(() => !button('取消下载'))
    check(canceled && !container.querySelector('.receipt'), '取消真实页面下载会中止请求且不显示保存成功')
    slow = false; button('下载 APK').click()
    await wait(() => !!container.querySelector('.receipt code'))
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
    const hex = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
    check(saving && container.querySelector('.receipt code')!.textContent === hex, '真实 WebView2 文件保存完成后展示正确 SHA-256')
    const query = container.querySelector<HTMLInputElement>('[aria-label="查询 Android 包名"]')!
    query.value = 'com.unknown.app'; query.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
    button('查询包名').click(); await wait(() => !!container.querySelector('.error'))
    check(container.querySelector('.error')!.textContent!.includes('未提供'), '官方无学生版本时不伪造下载链接')
  } finally { application?.unmount(); container.remove(); window.fetch = original }
}

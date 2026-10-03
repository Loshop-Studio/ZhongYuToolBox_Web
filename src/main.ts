import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/mobile.css'
import './styles/windows.css'
import './styles/android.css'
import './styles/ios.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { IS_BROWSER, PLATFORM, IS_AOKI, IS_MOBILE } from './config'
import { setupPlusBackButton } from './utils/plusBack'
import { logError } from './utils/errorText'
import { ElMessage } from 'element-plus'
import { initializeTheme } from './composables/useTheme'

// 内嵌 App（electron / plus）直接请求资源与接口，不需要、也不应发送 Referer 头
// （避免中育服务端按 Referer 校验导致图片/资源被拦截）。浏览器模式保持默认行为。
if (!IS_BROWSER) {
  const meta = document.createElement('meta')
  meta.name = 'referrer'
  meta.content = 'no-referrer'
  document.head.appendChild(meta)
}

if (IS_AOKI) {
  initializeTheme()
}
if (PLATFORM === 'android' || PLATFORM === 'plus') document.documentElement.classList.add('android-edition')
if (PLATFORM === 'ios') document.documentElement.classList.add('ios-edition')
if (IS_MOBILE) document.documentElement.classList.add('mobile-edition')

const app = createApp(App)

// 全局错误兜底：避免任何未捕获错误/渲染异常把整个应用掀成白屏。
// 渲染期错误就地捕获并提示；未处理的 Promise 拒绝记录后提示，便于排查而不是静默白屏。
app.config.errorHandler = (err, _instance, info) => {
  logError('vue-error', err)
  ElMessage.error('页面出错：' + (err instanceof Error ? err.message : String(err)) + '（' + info + '）')
}
window.addEventListener('unhandledrejection', (e) => {
  const r = (e as PromiseRejectionEvent).reason
  logError('unhandledrejection', r)
  ElMessage.error('未处理的异常：' + (r instanceof Error ? r.message : String(r)))
})
window.addEventListener('error', (e) => {
  logError('window-error', e)
})

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')

// 5+ 环境下把系统返回键绑定到网页路由（非 5+ 环境无副作用）
setupPlusBackButton()

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './styles/mobile.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { IS_BROWSER } from './config'
import { setupPlusBackButton } from './utils/plusBack'

// 内嵌 App（electron / plus）直接请求资源与接口，不需要、也不应发送 Referer 头
// （避免中育服务端按 Referer 校验导致图片/资源被拦截）。浏览器模式保持默认行为。
if (!IS_BROWSER) {
  const meta = document.createElement('meta')
  meta.name = 'referrer'
  meta.content = 'no-referrer'
  document.head.appendChild(meta)
}

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')

// 5+ 环境下把系统返回键绑定到网页路由（非 5+ 环境无副作用）
setupPlusBackButton()

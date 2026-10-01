<template>
  <div class="iframe-page">
    <div class="iframe-bar">
      <span class="iframe-bar-title">{{ kindLabel }}</span>
      <div class="iframe-bar-right">
        <el-button
          size="small"
          plain
          :icon="TopRight"
          @click="openInNewTab"
        >在新页面打开</el-button>
      </div>
    </div>
    <!-- 非 Electron：普通 iframe + useIframeInject（仅同源生效） -->
    <iframe
      v-if="!isElectronEnv && !isNativeEnv"
      :id="iframeId"
      :src="url"
      class="nested-iframe"
      frameborder="0"
      allowfullscreen
    ></iframe>
    <!-- Electron：<webview> 由 useWebviewInject 动态创建并 executeJavaScript 注入 -->
    <div
      v-else
      ref="webviewHost"
      class="nested-iframe"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { TopRight } from '@element-plus/icons-vue'
import { getIframeBase } from '@/config'
import { useAuthStore } from '@/stores/auth'
import { useIframeInject } from '@/composables/useIframeInject'
import { isElectron, useWebviewInject } from '@/composables/useWebviewInject'
import { isWebView2, useNativeEmbedded } from '@/composables/useNativeEmbedded'

const props = defineProps<{ kind: 'column' | 'course' }>()
const auth = useAuthStore()

const kindLabel = computed(
  () => ({ column: '在线专栏', course: '选课' }[props.kind])
)

const iframeId = computed(() => `${props.kind}_iframe`)

// Electron 渲染进程内走 <webview> + executeJavaScript 注入（无视同源）
const isElectronEnv = isElectron()
const isNativeEnv = isWebView2()
const webviewHost = ref<HTMLElement | null>(null)

const apiHost = computed(() => auth.apiBaseUrl || 'http://sxz.api.zykj.org')
const token = computed(() => auth.token || '')

// 复刻旧 index.js zxzl_set_url / ck_set_url
const url = computed(() => {
  const t = token.value
  if (props.kind === 'column') {
    // navPage.html（绝对地址，跨域）
    return `${getIframeBase()}/navPage.html?apiHost=${encodeURIComponent(
      apiHost.value
    )}&apiToken=${t}#/list?messageType=pager`
  }
  // 选课：index.html，与专栏一致走 webServer（iframeBase）根地址
  return `${getIframeBase()}/index.html?apiHost=${encodeURIComponent(
    apiHost.value
  )}&apiToken=${t}#/index/courseChoosing/StudentsCoursesList`
})

// 选课(ck) 注入内容：移除 .header-box，强制 #actScrollList 高度 70vh（CSS）/ 71vh（内联）。
// 专栏无需注入（字段留空），但两种形态都复用同一套配置结构。
const injectOpts = {
  removeClass: props.kind === 'course' ? 'header-box' : '',
  targetId: props.kind === 'course' ? 'actScrollList' : '',
  cssText:
    props.kind === 'course'
      ? '#actScrollList { height: 70vh !important; max-height: 70vh !important; min-height: 70vh !important; overflow: auto !important; }'
      : '',
  styleId: `injected-${props.kind}-style`
}

function openInNewTab() {
  window.open(url.value, '_blank')
}

// 注入分两条路径：
//  - 非 Electron（Web 同源 / 移动端 plus）：useIframeInject（contentDocument+MutationObserver，
//    跨域自动跳过，移动端 plus 不注入）。
//  - Electron：useWebviewInject（动态创建 <webview>，dom-ready 后用 executeJavaScript 注入，
//    无视同源，跨域 webServer 也能生效）。
if (isNativeEnv) {
  useNativeEmbedded({ hostRef: webviewHost, url, inject: injectOpts })
} else if (isElectronEnv) {
  useWebviewInject({ hostRef: webviewHost, url, inject: injectOpts })
} else {
  useIframeInject({ iframeId: iframeId.value, ...injectOpts, intervalMs: 100 })
}
</script>

<style scoped>
.iframe-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
}
.iframe-bar {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid #ebeef5;
  background: var(--el-fill-color-lighter);
}
.iframe-bar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.iframe-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nested-iframe {
  flex: 1;
  width: 100%;
  border: none;
  display: block;
}
</style>

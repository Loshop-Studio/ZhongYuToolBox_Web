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
    <iframe
      :id="iframeId"
      :src="url"
      class="nested-iframe"
      frameborder="0"
      allowfullscreen
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TopRight } from '@element-plus/icons-vue'
import { getIframeBase } from '@/config'
import { useAuthStore } from '@/stores/auth'
import { useIframeInject } from '@/composables/useIframeInject'

const props = defineProps<{ kind: 'column' | 'course' }>()
const auth = useAuthStore()

const kindLabel = computed(
  () => ({ column: '在线专栏', course: '选课' }[props.kind])
)

const iframeId = computed(() => `${props.kind}_iframe`)

const apiHost = computed(() => auth.apiBaseUrl || 'https://zyapi.loshop.com.cn')
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
  // 选课：ezyRawContent.html，旧版用同源相对路径，放入 public/ 后同源可用
  return `ezyRawContent.html?apiHost=${encodeURIComponent(
    apiHost.value
  )}&apiToken=${t}#/index/courseChoosing/StudentsCoursesList`
})

function openInNewTab() {
  window.open(url.value, '_blank')
}

// 选课(ck) iframe 沿用旧逻辑的 MutationObserver 样式注入：
// 移除 .header-box，强制 #actScrollList 高度 70vh。
// 仅当 iframe 同源（public/ezyRawContent.html）时生效。
useIframeInject({
  iframeId: iframeId.value,
  removeClass: props.kind === 'course' ? 'header-box' : '',
  targetId: props.kind === 'course' ? 'actScrollList' : '',
  cssText:
    props.kind === 'course'
      ? '#actScrollList { height: 70vh !important; max-height: 70vh !important; min-height: 70vh !important; overflow: auto !important; }'
      : '',
  styleId: `injected-${props.kind}-style`,
  intervalMs: 100
})
</script>

<style scoped>
.iframe-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.iframe-bar {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
}
.iframe-bar-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
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

<template>
  <div class="board-view">
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ title }}</span>
    </div>

    <div class="board-body">
      <el-result
        v-if="error"
        icon="error"
        title="画板加载失败"
        :sub-title="error"
      >
        <template #extra>
          <el-button type="primary" @click="goBack">返回</el-button>
        </template>
      </el-result>

      <div v-else-if="!blob" class="board-ph">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载画板中…</span>
      </div>

      <EzyBoardViewer
        v-else
        ref="viewerRef"
        :source="blob"
        :file-name="fileName"
        class="board"
        @loaded="onLoaded"
        @error="onError"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Loading } from '@element-plus/icons-vue'
import { EzyBoardViewer } from 'ezy-board-viewer'
import { fetchContentBlob } from '@/api/quora'

const route = useRoute()
const router = useRouter()

const content = (route.query.content as string) || ''
const fileName = (route.query.name as string) || 'board'
const title = '画板查看'

const blob = ref<Blob | null>(null)
const error = ref('')
const isRecording = ref(false)

// 组件实例 ref：离开页面时调用 pause() 暂停录制播放
const viewerRef = ref<any>(null)

async function load() {
  if (!content) {
    error.value = '缺少画板资源地址'
    return
  }
  try {
    blob.value = await fetchContentBlob(content)
  } catch (e: any) {
    error.value = e?.message || String(e)
  }
}

function onLoaded(info: { kind: 'static' | 'recording'; pages: number; duration: number }) {
  isRecording.value = info.kind === 'recording'
}

function onError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  error.value = msg
  ElMessage.warning('画板解析失败：' + msg)
}

// 离开前：若是录制则先暂停播放，再返回
function pauseIfNeeded() {
  if (isRecording.value && viewerRef.value) {
    try {
      viewerRef.value.pause()
    } catch {
      /* 忽略 */
    }
  }
}

function goBack() {
  pauseIfNeeded()
  if (window.history.length > 1) router.back()
  else router.push('/quora')
}

// 路由返回（浏览器/系统返回键、router.back、导航守卫）都要先暂停
onBeforeRouteLeave(() => {
  pauseIfNeeded()
  return true
})

// 组件销毁兜底（任何退出路径都暂停）
onBeforeUnmount(() => {
  pauseIfNeeded()
})

onMounted(load)
</script>

<style scoped>
.board-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-fill-color-light);
}
.appbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  flex-shrink: 0;
}
.appbar .back {
  font-size: 20px;
  cursor: pointer;
}
.appbar-title {
  font-weight: 600;
  font-size: 16px;
}
.board-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 14px;
  box-sizing: border-box;
}
.board {
  width: 100%;
  height: 100%;
  min-height: 420px;
}
.board-ph {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--el-text-color-secondary);
}
</style>

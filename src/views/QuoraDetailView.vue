<template>
  <div class="quora-detail">
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ sessionName || '问题详情' }}</span>
      <div class="appbar-actions">
        <el-button v-if="false" size="small" :icon="Share" @click="shareSession">分享</el-button>
        <el-button size="small" type="primary" :icon="EditPen" @click="openBoard">画板回复</el-button>
      </div>
    </div>

    <el-scrollbar class="detail-scroll" v-loading="msgLoading">
      <div class="detail-body">
        <el-empty v-if="!msgLoading && messages.length === 0" description="暂无回复" />
        <div
          v-for="(m, i) in messages"
          :key="m.id || i"
          class="msg-card"
          :class="{ primary: m.isPrimary }"
        >
          <div class="msg-user">
            {{ m.userName }}
            <el-tag v-if="m.isPrimary" size="small" type="success">公开</el-tag>
            <el-tag v-else size="small" type="info">不公开</el-tag>
            <span v-if="m.sendTime" class="msg-time">{{ m.sendTime }}</span>
          </div>
          <el-image
            :src="proxyImgSrc(m.snapShot)"
            fit="contain"
            class="msg-img"
            :preview-src-list="msgPreviewList"
            :initial-index="i"
            preview-teleported
            hide-on-click-modal
          >
            <template #error>
              <div class="thumb-ph"><el-icon><Picture /></el-icon></div>
            </template>
          </el-image>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Picture, Share, EditPen } from '@element-plus/icons-vue'
import { proxyImgSrc } from '@/utils/proxy'
import { getMessages, resetReadState, markSessionRead, type QuoraMessage } from '@/api/quora'

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => String(route.params.sessionId || ''))

const messages = ref<QuoraMessage[]>([])
const msgLoading = ref(false)
const sessionName = ref(String(route.query.name || ''))

const msgPreviewList = computed(() => messages.value.map((m) => proxyImgSrc(m.snapShot)))

async function load() {
  if (!sessionId.value) return
  msgLoading.value = true
  try {
    const msgs = await getMessages(sessionId.value)
    messages.value = msgs
    try {
      await resetReadState(sessionId.value)
      markSessionRead(sessionId.value)
    } catch {
      /* 忽略 */
    }
  } catch (e: any) {
    ElMessage.error('加载消息失败：' + (e.message || e))
  } finally {
    msgLoading.value = false
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/quora')
}

function openBoard() {
  const img = messages.value.length ? messages.value[0].snapShot : ''
  router.push(`/quora/${sessionId.value}/board${img ? `?img=${encodeURIComponent(img)}` : ''}`)
}

function shareSession() {
  router.push(`/share?type=quora&id=${sessionId.value}`)
}

onMounted(load)
// keep-alive 会复用同一组件实例，切换不同会话时需重新加载
watch(
  () => route.params.sessionId,
  () => load()
)
</script>

<style scoped>
.quora-detail {
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.appbar-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.detail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
.detail-body {
  padding: 14px;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.msg-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 10px;
  background: var(--el-bg-color);
}
.msg-card.primary {
  border-color: var(--el-color-success-light-5);
}
.msg-user {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 14px;
}
.msg-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.msg-img {
  width: 100%;
  max-height: 480px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.thumb-ph {
  width: 100%;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--el-text-color-placeholder);
}

@media (max-width: 767px) {
  .detail-body {
    padding: 12px 16px;
    max-width: 100%;
  }
}
</style>

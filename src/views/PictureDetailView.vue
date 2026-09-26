<template>
  <div class="pic-detail">
    <!-- 顶部返回栏（与笔记详情 appbar 一致） -->
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ name || '图片详情' }}</span>
      <!-- 桌面端：直接按钮 -->
      <template v-if="!isMobile">
        <el-button type="primary" :icon="View" @click="openRaw">打开原图</el-button>
        <el-button :icon="Download" @click="download">下载</el-button>
      </template>
      <!-- 移动端：三个点按钮 + 底部弹出面板 -->
      <template v-else>
        <button type="button" class="more-btn" @click="showSheet = true">
          <el-icon><MoreFilled /></el-icon>
        </button>
        <Teleport to="body">
          <div v-if="showSheet" class="actions-mask" @click="showSheet = false" />
          <div v-if="showSheet" class="actions-sheet">
            <div class="actions-item" @click="onAction('raw')">
              <el-icon><View /></el-icon><span>打开原图</span>
            </div>
            <div class="actions-item" @click="onAction('download')">
              <el-icon><Download /></el-icon><span>下载</span>
            </div>
            <div class="actions-cancel" @click="showSheet = false">取消</div>
          </div>
        </Teleport>
      </template>
    </div>

    <div class="detail-body" v-loading="loading">
      <el-image
        :src="imgSrc"
        :preview-src-list="previewList"
        :initial-index="0"
        fit="contain"
        class="detail-img"
        preview-teleported
        hide-on-click-modal
      >
        <template #error>
          <div class="detail-ph"><el-icon><Picture /></el-icon><span>图片加载失败</span></div>
        </template>
      </el-image>
    </div>

    <el-descriptions class="detail-meta" :column="1" border>
      <el-descriptions-item label="名称">{{ name }}</el-descriptions-item>
      <el-descriptions-item label="大小">{{ size }}</el-descriptions-item>
      <el-descriptions-item label="时间">{{ createTime }}</el-descriptions-item>
      <el-descriptions-item label="ID">{{ id }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, View, Download, Picture, MoreFilled } from '@element-plus/icons-vue'
import { proxyImgSrc, proxyUrl } from '@/utils/proxy'
import { saveUrlFile } from '@/utils/saveFile'
import { useIsMobile } from '@/composables/useIsMobile'
import { formatError, logError } from '@/utils/errorText'
import { ElMessage } from 'element-plus'

const { isMobile } = useIsMobile()
const route = useRoute()
const router = useRouter()

const picture = ref<string>((route.query.picture as string) || '')
const name = ref<string>((route.query.name as string) || '')
const size = ref<string>((route.query.size as string) || '')
const createTime = ref<string>((route.query.createTime as string) || '')
const id = ref<string>((route.query.id as string) || '')
const loading = ref(false)
const showSheet = ref(false)

const imgSrc = computed(() => proxyImgSrc(picture.value))
const previewList = computed(() => (picture.value ? [imgSrc.value] : []))

// keep-alive 复用同一组件实例时，从 query 同步最新参数
function syncFromQuery() {
  picture.value = (route.query.picture as string) || ''
  name.value = (route.query.name as string) || ''
  size.value = (route.query.size as string) || ''
  createTime.value = (route.query.createTime as string) || ''
  id.value = (route.query.id as string) || ''
}

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/picture')
}

function openRaw() {
  if (picture.value) window.open(proxyUrl(picture.value), '_blank')
}

async function download() {
  if (!picture.value) return
  // 与预览图用同一套地址解析（proxyImgSrc 会把 sxz.alicdn 换成可直连的 OSS）。
  // 直接把 URL 交给 saveUrlFile：5+ 走原生下载管理器，其余平台 fetch 后保存，
  // 不再先 fetch 成 Blob 再写盘，规避 0 字节问题。
  const src = proxyImgSrc(picture.value)
  try {
    await saveUrlFile(src, name.value || 'image')
  } catch (e: any) {
    logError('PictureDetailView.download', { url: src, error: formatError(e), raw: e })
    ElMessage.error('下载失败：' + (e?.message || e))
  }
}

function onAction(cmd: string) {
  showSheet.value = false
  if (cmd === 'raw') openRaw()
  else if (cmd === 'download') download()
}

onMounted(() => {
  if (!picture.value) {
    router.replace('/picture')
  }
})
// keep-alive 下切换不同图片（query 不同）时同步参数并刷新
watch(
  () => route.fullPath,
  () => syncFromQuery()
)
</script>

<style scoped>
.pic-detail {
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
/* 顶部 sticky 返回栏（与笔记详情 appbar 一致） */
.appbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 16px;
  margin-bottom: 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}
.appbar .back {
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
  color: var(--el-text-color-regular);
}
.appbar-title {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 三个点按钮（与笔记详情一致） */
.more-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--el-text-color-primary);
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 50%;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}
.more-btn:hover {
  background: var(--el-fill-color-light);
}
/* 移动端底部弹出面板（带遮罩） */
.actions-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
}
.actions-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2001;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
  background: var(--el-bg-color);
  border-top-left-radius: 14px;
  border-top-right-radius: 14px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.12);
}
.actions-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 20px;
  font-size: 16px;
  color: var(--el-text-color-primary);
  cursor: pointer;
}
.actions-item:active {
  background: var(--el-fill-color-light);
}
.actions-cancel {
  margin-top: 6px;
  padding: 15px 20px;
  text-align: center;
  font-size: 16px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
}
.detail-body {
  flex: 1 1 auto;
  min-height: 60vh;
  background: #000;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.detail-img {
  max-height: 64vh;
  max-width: 100%;
}
.detail-ph {
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 28px;
}
.detail-ph span {
  font-size: 13px;
}
.detail-meta {
  margin-top: 16px;
}

@media (max-width: 767px) {
  .pic-detail {
    padding: 0;
  }
  .appbar {
    margin-bottom: 8px;
    padding: 0 10px;
  }
  .detail-img {
    max-height: 56vh;
  }
  .detail-body {
    border-radius: 6px;
    padding: 6px;
  }
}
</style>

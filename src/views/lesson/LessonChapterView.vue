<template>
  <div class="lesson-chapter-page">
    <!-- 顶栏 -->
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ courseTitle || ('课程 ' + courseId) }}</span>
      <!-- 桌面端：横排按钮 -->
      <template v-if="!isMobile">
        <el-button type="primary" @click="manualRender">手动渲染</el-button>
        <el-button type="info" @click="downloadSource">下载源文件</el-button>
        <el-button v-if="false && shareTarget" type="success" plain @click="openShare">分享</el-button>
      </template>
      <!-- 移动端：三个点按钮 + 底部弹出面板（与笔记详情一致） -->
      <template v-else>
        <button type="button" class="more-btn" @click="showSheet = true">
          <el-icon><MoreFilled /></el-icon>
        </button>
        <Teleport to="body">
          <div v-if="showSheet" class="actions-mask" @click="showSheet = false" />
          <div v-if="showSheet" class="actions-sheet">
            <div class="actions-item" @click="onActionCommand('render')">
              <span>手动渲染</span>
            </div>
            <div class="actions-item" @click="onActionCommand('download')">
              <span>下载源文件</span>
            </div>
            <div v-if="false && shareTarget" class="actions-item" @click="onActionCommand('share')">
              <span>分享</span>
            </div>
            <div class="actions-cancel" @click="showSheet = false">取消</div>
          </div>
        </Teleport>
      </template>
    </div>

    <!-- 内容 -->
    <div class="content-card">
      <div v-loading="loading" class="content-body">
        <div v-if="!loading && !contentHtml" class="muted center">加载中或内容为空</div>
        <div ref="showRef" class="lesson-content" v-html="contentHtml"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, MoreFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { LessonCourse } from '@/api/lesson'
import { readContent, getLearningCourses } from '@/api/lesson'
import { renderLessonContent, hasRawAttachments, type AttachmentHandlers } from '@/composables/useContentRenderer'
import { useShareStore, type ShareTarget } from '@/stores/share'
import { useIsMobile } from '@/composables/useIsMobile'
import { saveBlobFile } from '@/utils/saveFile'

const router = useRouter()
const route = useRoute()
const courseId = ref(String(route.params.courseId))
const catalogId = ref(String(route.params.catalogId))
const shareStore = useShareStore()
const { isMobile } = useIsMobile()

const courseTitle = ref('')
const loading = ref(false)
const contentHtml = ref('')
const showRef = ref<HTMLElement | null>(null)
const rawContentJson = ref('')
const shareTarget = ref<ShareTarget | null>(null)
const showSheet = ref(false)

const handlers: AttachmentHandlers = {
  onViewObject: (url, name) => openViewer('video', url, name),
  onViewPpt: (url, name) => openViewer('pptx', url, name),
  onViewPdf: (url, name) => openViewer('pdf', url, name),
  onDownload: (url, _name) => window.open(url, '_blank')
}

function openViewer(kind: 'video' | 'pptx' | 'pdf', url: string, name: string) {
  router.push({
    path: '/lesson/viewer',
    query: { kind, url, name }
  })
}

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push(`/lesson/${courseId.value}`)
}

async function loadContent() {
  loading.value = true
  try {
    const html = await readContent(catalogId.value, courseId.value)
    contentHtml.value = html
    rawContentJson.value = JSON.stringify(html)
    await nextTick()
    if (showRef.value) renderLessonContent(showRef.value, handlers)
    window.scrollTo(0, 0)
  } catch (e: any) {
    ElMessage.error('加载内容失败：' + (e.message || e))
  } finally {
    loading.value = false
  }
}

function manualRender() {
  if (showRef.value) {
    renderLessonContent(showRef.value, handlers)
    if (hasRawAttachments(showRef.value)) {
      ElMessage.warning('仍有部分附件未能渲染，可能是内容结构异常')
    } else {
      ElMessage.success('渲染完成')
    }
  }
}

async function downloadSource() {
  if (!rawContentJson.value) {
    ElMessage.warning('请先打开章节内容')
    return
  }
  const blob = new Blob([rawContentJson.value], { type: 'text/plain;charset=utf-8' })
  await saveBlobFile(blob, (courseTitle.value || 'lesson') + '_' + catalogId.value + '.rcf')
}

function openShare() {
  if (!shareTarget.value) return
  shareStore.setCurrent(shareTarget.value)
  ElMessage.info('已写入分享目标，请在「分享」页查看')
}

/** 移动端底部面板命令分发 */
function onActionCommand(cmd: 'render' | 'download' | 'share') {
  showSheet.value = false
  if (cmd === 'render') manualRender()
  else if (cmd === 'download') downloadSource()
  else if (cmd === 'share') openShare()
}

async function load() {
  try {
    const list = await getLearningCourses().catch(() => [] as LessonCourse[])
    const found = (list as LessonCourse[]).find((c) => String(c.id) === courseId.value)
    if (found) {
      courseTitle.value = found.title
      shareTarget.value = { type: 'chapter', id: courseId.value, title: found.title, chapterId: catalogId.value }
    } else {
      shareTarget.value = { type: 'chapter', id: courseId.value, title: '课程' + courseId.value, chapterId: catalogId.value }
    }
  } catch {
    /* 忽略课程信息加载失败 */
  }
  await loadContent()
}

onMounted(load)

// keep-alive 下，courseId / catalogId 变化时重新加载（修复从 /lesson/51 切到 /lesson/545 仍显示旧内容的问题）
watch(
  () => [route.params.courseId, route.params.catalogId],
  ([cId, catId]) => {
    courseId.value = String(cId)
    catalogId.value = String(catId)
    contentHtml.value = ''
    load()
  }
)
</script>

<style scoped>
.lesson-chapter-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
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
.appbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
/* 三个点按钮：无背景、黑色图标（与笔记详情一致） */
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
/* 移动端底部弹出面板（带遮罩，与笔记详情一致） */
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
.content-card {
  background: var(--el-bg-color);
  border-radius: 8px;
  padding: 16px;
  min-height: 200px;
}
.content-body {
  min-height: 200px;
}
.center {
  text-align: center;
  padding: 40px 0;
}
.lesson-content :deep(img) {
  max-width: 100%;
}
.lesson-content :deep(.lesson-link) {
  color: var(--el-color-primary);
  cursor: pointer;
  margin: 0 4px;
}
.lesson-content :deep(.lesson-exercise) {
  color: var(--el-color-danger);
}
@media (max-width: 767px) {
  .appbar {
    margin-bottom: 8px;
    padding: 0 10px;
  }
}
</style>

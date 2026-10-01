<template>
  <div class="exam-detail">
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ name || '试题详情' }}</span>
      <!-- 桌面端：按钮平铺 -->
      <div class="appbar-actions desktop-only">
        <el-button size="small" :icon="DataLine" @click="goOverview">概览</el-button>
        <el-button size="small" :icon="TrendCharts" @click="goAnalysis">题目分析</el-button>
        <el-button size="small" type="success" :icon="Download" :loading="exporting" @click="exportAnswers">
          导出班级作答答案
        </el-button>
        <el-button v-if="false" size="small" :icon="Share" @click="shareExam">分享</el-button>
      </div>
      <!-- 移动端：三个点触发底部弹层 -->
      <button v-if="isMobile" type="button" class="more-btn mobile-only" @click="mobileMenuVisible = true">
        <el-icon><MoreFilled /></el-icon>
      </button>
    </div>

    <!-- 移动端底部二级菜单（与图片/笔记详情一致） -->
    <Teleport to="body">
      <div v-if="mobileMenuVisible" class="actions-mask" @click="mobileMenuVisible = false" />
      <div v-if="mobileMenuVisible" class="actions-sheet">
        <div class="actions-item" @click="sheetCommand('overview')">
          <el-icon><DataLine /></el-icon><span>概览</span>
        </div>
        <div class="actions-item" @click="sheetCommand('analysis')">
          <el-icon><TrendCharts /></el-icon><span>题目分析</span>
        </div>
        <div class="actions-item" @click="sheetCommand('export')">
          <el-icon><Download /></el-icon><span>导出班级作答答案</span>
        </div>
        <div v-if="false" class="actions-item" @click="sheetCommand('share')">
          <el-icon><Share /></el-icon><span>分享</span>
        </div>
        <div class="actions-cancel" @click="mobileMenuVisible = false">取消</div>
      </div>
    </Teleport>

    <el-scrollbar class="detail-scroll" v-loading="loading">
      <div class="detail-body">
        <el-empty v-if="!loading && questions.length === 0" description="没有题目" />
        <el-card
          v-for="q in questions"
          :key="q.number"
          class="qst-card"
          shadow="never"
        >
          <template #header>
            <span class="qst-no">题目 {{ q.number }}</span>
          </template>
          <div class="qst-block"><strong>题干:</strong><div v-html="q.stem" /></div>
          <div class="qst-block" v-if="q.answer"><strong>答案:</strong><div v-html="q.answer" /></div>
          <div class="qst-block" v-if="q.explanation"><strong>解析:</strong><div v-html="q.explanation" /></div>
          <div class="qst-block" v-if="q.knowledge"><strong>知识点:</strong><div v-html="q.knowledge" /></div>
        </el-card>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useExamDetailLoad } from '@/composables/useExamDetailLoad'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, DataLine, TrendCharts, Download, Share, MoreFilled } from '@element-plus/icons-vue'
import { useIsMobile } from '@/composables/useIsMobile'
import {
  getExamTask,
  getQstAnswerView,
  exportObjectiveAnswers,
  parseExamQuestions,
  type ParsedQuestion
} from '@/api/exam'
import { saveBlobFile } from '@/utils/saveFile'

const route = useRoute()
const router = useRouter()
const { isMobile } = useIsMobile()
const taskId = computed(() => Number(route.params.taskId))

const name = ref(String(route.query.name || ''))
const questions = ref<ParsedQuestion[]>([])
const examId = ref<number | null>(null)

const loading = useExamDetailLoad('exam-questions', async ({ id, name: title, signal, isCurrent }) => {
  questions.value = []
  examId.value = null
  const exam = await getExamTask(id, signal)
  if (!isCurrent()) return
  const actualExamId = Number(exam?.examId)
  if (!Number.isSafeInteger(actualExamId) || actualExamId <= 0) throw new Error('测评缺少有效 examId')
  examId.value = actualExamId
  name.value = title || exam?.examName || ''
  const parsed = await parseExamQuestions(exam, qstId => getQstAnswerView(qstId, signal), signal)
  if (isCurrent()) questions.value = parsed
}, err => ElMessage.error('加载题目失败：' + (err.message || err)))

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/exam')
}
function goOverview() {
  if (examId.value == null) return
  router.push(`/exam/${taskId.value}/overview${name.value ? `?name=${encodeURIComponent(name.value)}` : ''}`)
}
function goAnalysis() {
  if (examId.value == null) return
  router.push(`/exam/${taskId.value}/analysis${name.value ? `?name=${encodeURIComponent(name.value)}` : ''}`)
}

const exporting = ref(false)
async function exportAnswers() {
  if (examId.value == null) return
  exporting.value = true
  try {
    const blob = await exportObjectiveAnswers(examId.value)
    await saveBlobFile(blob, `${name.value || 'exam'}_客观题答案.xlsx`)
    ElMessage.success('已导出')
  } catch (e: any) {
    ElMessage.error('导出失败：' + (e.message || e))
  } finally {
    exporting.value = false
  }
}
function shareExam() {
  if (examId.value == null) {
    ElMessage.warning('暂无可导出的测评')
    return
  }
  router.push(`/share?type=evaluation&id=${examId.value}`)
}

const mobileMenuVisible = ref(false)
function sheetCommand(cmd: string) {
  mobileMenuVisible.value = false
  if (cmd === 'overview') goOverview()
  else if (cmd === 'analysis') goAnalysis()
  else if (cmd === 'export') exportAnswers()
  else if (cmd === 'share') shareExam()
}

</script>

<style scoped>
.exam-detail {
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
  flex-shrink: 0;
}
/* 移动端默认隐藏桌面按钮，显示三个点下拉 */
.mobile-only {
  display: none;
  margin-left: auto;
}
/* 三个点按钮（与图片/笔记详情一致） */
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
/* 移动端底部弹出面板（带遮罩，与图片/笔记详情一致） */
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
.detail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
/* 让 el-scrollbar 内部 wrap/view 撑满，避免内容不足一屏时底部留白条 */
.detail-scroll :deep(.el-scrollbar__wrap),
.detail-scroll :deep(.el-scrollbar__view) {
  height: 100%;
}
.detail-body {
  padding: 14px;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 900px;
  margin: 0 auto;
}
.qst-card {
  border-radius: 10px;
}
.qst-no {
  font-weight: 600;
}
.qst-block {
  margin-bottom: 8px;
}
.qst-block :deep(img) {
  max-width: 100%;
  height: auto;
}

@media (max-width: 767px) {
  .detail-body {
    padding: 12px;
    max-width: 100%;
  }
  .appbar-actions.desktop-only {
    display: none;
  }
  .mobile-only {
    display: inline-flex;
  }
}
</style>

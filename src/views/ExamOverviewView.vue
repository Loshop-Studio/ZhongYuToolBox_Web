<template>
  <div class="exam-detail">
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ name || '考试概览' }}</span>
      <div class="appbar-actions desktop-only">
        <el-button size="small" :icon="Document" @click="goQuestions">试题</el-button>
        <el-button size="small" :icon="TrendCharts" @click="goAnalysis">题目分析</el-button>
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
        <div class="actions-item" @click="sheetCommand('questions')">
          <el-icon><Document /></el-icon><span>试题</span>
        </div>
        <div class="actions-item" @click="sheetCommand('analysis')">
          <el-icon><TrendCharts /></el-icon><span>题目分析</span>
        </div>
        <div class="actions-cancel" @click="mobileMenuVisible = false">取消</div>
      </div>
    </Teleport>

    <el-scrollbar class="detail-scroll" v-loading="loading">
      <div class="detail-body">
        <el-empty v-if="!loading && !overview" description="无数据" />
        <template v-if="overview">
          <div class="stat-row">
            <div class="stat-card"><small>总分</small><h5>{{ overview.examTotalScore ?? '-' }}</h5></div>
            <div class="stat-card"><small>平均分</small><h5>{{ overview.averageScoreOfCourse ?? '-' }}</h5></div>
            <div class="stat-card"><small>最高分</small><h5>{{ overview.highestScoreOfCourse ?? '-' }}</h5></div>
            <div class="stat-card"><small>最低分</small><h5>{{ overview.lowestScoreOfCourse ?? '-' }}</h5></div>
          </div>

          <div class="stat-row">
            <div
              v-for="(it, i) in progressItems"
              :key="it.key"
              class="stat-card border"
              :class="'border-' + it.color"
            >
              <small>{{ it.label }}</small>
              <h6 :class="'text-' + it.color">{{ it.item.count ?? 0 }} <small>({{ ((it.item.rate ?? 0) * 100).toFixed(0) }}%)</small></h6>
            </div>
          </div>

          <div v-if="overview.unSubmitStudents?.length" class="stu-line text-danger">
            <strong>未提交学生 ({{ overview.unSubmitStudents.length }}人):</strong> {{ overview.unSubmitStudents.join(', ') }}
          </div>
          <div v-if="overview.unRevisingStudents?.length" class="stu-line text-info">
            <strong>未修订学生 ({{ overview.unRevisingStudents.length }}人):</strong> {{ overview.unRevisingStudents.join(', ') }}
          </div>

          <el-table v-if="overview.studentGrades?.length" :data="overview.studentGrades" size="small" stripe class="grade-table">
            <el-table-column prop="studentNumber" label="学号" />
            <el-table-column prop="studentName" label="姓名" />
            <el-table-column prop="className" label="班级" />
            <el-table-column prop="score" label="得分" />
            <el-table-column label="得分率">
              <template #default="{ row }">{{ (row.scoreRate ?? 0).toFixed(2) }}%</template>
            </el-table-column>
            <el-table-column prop="rankingOfCourse" label="课程排名" />
          </el-table>
        </template>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Document, TrendCharts, MoreFilled } from '@element-plus/icons-vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { getExamTask, getExamOverview } from '@/api/exam'

const route = useRoute()
const router = useRouter()
const { isMobile } = useIsMobile()
const taskId = computed(() => Number(route.params.taskId))
const name = ref(String(route.query.name || ''))
const examId = ref<number | null>(null)

const loading = ref(false)
const overview = ref<any>(null)

const progressItems = computed(() => {
  const r = overview.value || {}
  const defs = [
    { key: 'unSubmitItem', label: '未提交', color: 'danger' },
    { key: 'unCorrectItem', label: '未批改', color: 'warning' },
    { key: 'unRevisingItem', label: '未修订', color: 'info' },
    { key: 'unRevisingCorrectItem', label: '修订未批', color: 'secondary' },
    { key: 'finishItem', label: '已完成', color: 'success' }
  ]
  return defs.map((d) => ({ ...d, item: r[d.key] || {} }))
})

async function load() {
  loading.value = true
  overview.value = null
  try {
    const exam = await getExamTask(taskId.value)
    examId.value = Number(exam?.examId ?? exam?.examTaskId ?? taskId)
    // 切换考试（keep-alive 复用实例）时必须重算标题，否则残留上一个考试的标题
    name.value = String(route.query.name || '') || exam?.examName || name.value
    overview.value = await getExamOverview(examId.value)
  } catch (e: any) {
    ElMessage.error('加载概览失败：' + (e.message || e))
  } finally {
    loading.value = false
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/exam')
}
function goQuestions() {
  router.push(`/exam/${taskId.value}${name.value ? `?name=${encodeURIComponent(name.value)}` : ''}`)
}
function goAnalysis() {
  router.push(`/exam/${taskId.value}/analysis${name.value ? `?name=${encodeURIComponent(name.value)}` : ''}`)
}

const mobileMenuVisible = ref(false)
function sheetCommand(cmd: string) {
  mobileMenuVisible.value = false
  if (cmd === 'questions') goQuestions()
  else if (cmd === 'analysis') goAnalysis()
}

onMounted(load)
// keep-alive 会复用同一组件实例，切换不同考试任务时需重新加载
watch(
  () => [route.params.taskId, route.query.name],
  () => load()
)
</script>

<style scoped>
.exam-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
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
.detail-scroll :deep(.el-scrollbar__wrap),
.detail-scroll :deep(.el-scrollbar__view) {
  height: 100%;
}
.detail-body {
  padding: 14px;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  max-width: 960px;
  margin: 0 auto;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.stat-card {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}
.stat-card small {
  color: var(--el-text-color-secondary);
}
.stat-card h5,
.stat-card h6 {
  margin: 4px 0 0;
}
.stu-line {
  margin: 8px 0;
  font-size: 13px;
}
.grade-table {
  margin-top: 12px;
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

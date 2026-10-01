<template>
  <div class="exam-detail">
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ name || '题目分析' }}</span>
      <div class="appbar-actions desktop-only">
        <el-button size="small" @click="router.push('/exam')">返回新测评</el-button>
        <el-button size="small" :icon="Document" @click="goQuestions">试题</el-button>
        <el-button size="small" :icon="DataLine" @click="goOverview">概览</el-button>
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
        <div class="actions-item" @click="sheetCommand('overview')">
          <el-icon><DataLine /></el-icon><span>概览</span>
        </div>
        <div class="actions-item" @click="router.push('/exam'); mobileMenuVisible = false"><span>返回新测评</span></div>
        <div class="actions-cancel" @click="mobileMenuVisible = false">取消</div>
      </div>
    </Teleport>

    <el-scrollbar class="detail-scroll" v-loading="loading">
      <div class="detail-body">
        <el-alert v-if="review" :title="`已识别本人错题 ${review.questionIds.length} 题${review.numbers.length ? '：' + review.numbers.join('、') : ''}${review.unmatched ? '；' + review.unmatched + ' 题无法匹配，暂不允许导入' : ''}。返回新测评后可加入官方错题本。`" type="info" :closable="false" class="review-tip" />
        <el-empty v-if="!loading && analysisGroups.length === 0" description="无题目分析数据" />
        <el-card
          v-for="(g, gi) in analysisGroups"
          :key="gi"
          class="ana-card"
          shadow="never"
        >
          <template #header>
            <span class="ana-title">{{ g.number }}、{{ g.title }} <small class="text-muted">(共{{ g.score }}分)</small></span>
          </template>
          <div v-for="(q, qi) in (g.testQuestionAnalysis || [])" :key="qi" class="ana-q">
            <span class="fw-bold">题{{ q.number }}</span>
            <span :class="q.errorCount > 0 ? 'text-danger' : 'text-success'" class="ms-2">错误: {{ q.errorCount || 0 }}人</span>
            <span class="text-muted ms-2">得分: {{ q.score }}分</span>
            <span v-if="q.name" class="text-muted ms-2">({{ q.name }})</span>
            <div v-if="(q.errorStudents || []).length" class="err-stu text-danger">
              错误学生: {{ q.errorStudents.map(mapStudent).join(', ') }}
            </div>
            <div v-if="q.childrenAnalysis?.length" class="ana-children">
              <div v-for="(c, ci) in q.childrenAnalysis" :key="ci" class="ana-child">
                <span class="fw-bold">{{ c.number }}</span>
                <span :class="c.errorCount > 0 ? 'text-danger' : 'text-success'" class="ms-2">错误: {{ c.errorCount || 0 }}人</span>
                <span class="text-muted ms-2">得分: {{ c.score }}分</span>
                <div v-if="(c.errorStudents || []).length" class="err-stu text-danger">
                  错误学生: {{ c.errorStudents.map(mapStudent).join(', ') }}
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onDeactivated, onBeforeUnmount, onActivated, watch } from 'vue'
import { saveExamReview, type ExamReview } from '@/utils/examReview'
import { accountKey } from '@/utils/localData'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Document, DataLine, MoreFilled } from '@element-plus/icons-vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { getExamTask, getExamOverview, getQuestionAnalysis } from '@/api/exam'

const route = useRoute()
const router = useRouter()
const { isMobile } = useIsMobile()
const taskId = computed(() => Number(route.params.taskId))
const name = ref(String(route.query.name || ''))
const examId = ref<number | null>(null)

const loading = ref(false)
const analysisGroups = ref<any[]>([])
const studentMap = ref<Record<string, string>>({})
const review = ref<ExamReview>()
let controller: AbortController | undefined
let active = true

function mapStudent(sid: string | number): string {
  return studentMap.value[String(sid)] || String(sid)
}

async function load() {
  controller?.abort(); const current = controller = new AbortController(), key = accountKey(), id = taskId.value
  loading.value = true
  analysisGroups.value = []
  review.value = undefined
  try {
    const exam = await getExamTask(id, current.signal)
    if (current.signal.aborted || accountKey() !== key) return
    examId.value = Number(exam?.examId)
    if (!Number.isSafeInteger(examId.value) || examId.value <= 0) throw new Error('测评缺少有效 examId')
    // 切换考试（keep-alive 复用实例）时必须重算标题，否则残留上一个考试的标题
    name.value = String(route.query.name || '') || exam?.examName || name.value

    const [ov, data] = await Promise.all([getExamOverview(examId.value, current.signal).catch(() => null), getQuestionAnalysis(examId.value, current.signal)])
    if (current.signal.aborted || accountKey() !== key) return
    const map: Record<string, string> = {}
    ;(ov?.studentGrades || []).forEach((s: any) => {
      map[String(s.studentId)] = s.studentName || s.studentId
    })
    studentMap.value = map

    analysisGroups.value = data?.testGroupAnalysis || []
    review.value = await saveExamReview(id, exam, data, key, current.signal)
  } catch (e: any) {
    if (!current.signal.aborted) ElMessage.error('加载题目分析失败：' + (e.message || e))
  } finally {
    if (controller === current) loading.value = false
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/exam')
}
function goQuestions() {
  router.push(`/exam/${taskId.value}${name.value ? `?name=${encodeURIComponent(name.value)}` : ''}`)
}
function goOverview() {
  router.push(`/exam/${taskId.value}/overview${name.value ? `?name=${encodeURIComponent(name.value)}` : ''}`)
}

const mobileMenuVisible = ref(false)
function sheetCommand(cmd: string) {
  mobileMenuVisible.value = false
  if (cmd === 'questions') goQuestions()
  else if (cmd === 'overview') goOverview()
}

onMounted(load)
onActivated(() => { active = true; if (controller?.signal.aborted) load() })
onDeactivated(() => { active = false; controller?.abort() }); onBeforeUnmount(() => controller?.abort())
// keep-alive 会复用同一组件实例，切换不同考试任务时需重新加载
watch(
  () => [route.params.taskId, route.query.name],
  () => { if (active && route.name === 'exam-analysis') load() }
)
</script>

<style scoped>
.exam-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-fill-color-light);
}
.review-tip { margin-bottom:16px; }
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
.ana-card {
  margin-bottom: 12px;
  border-radius: 10px;
}
.ana-title {
  font-weight: 600;
}
.ana-q {
  margin-bottom: 10px;
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.ana-children {
  margin-left: 12px;
  margin-top: 6px;
}
.ana-child {
  margin-bottom: 6px;
}
.err-stu {
  font-size: 12px;
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

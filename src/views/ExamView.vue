<template>
  <div class="exam-page">
    <el-alert title="已完成作业会自动读取题目分析、识别本人错题。识别后直接点击“加入官方错题本”，无需逐个打开作业。" type="info" :closable="false" class="flow-tip" />
    <!-- 列表卡片 -->
    <el-card class="list-card" shadow="never">
      <div class="list-head">
        <el-radio-group v-model="listType" :disabled="!!syncing" @change="load(1)"><el-radio-button :value="4">已完成作业</el-radio-button><el-radio-button :value="1">待处理作业</el-radio-button><el-radio-button :value="2">全部作业</el-radio-button></el-radio-group>
        <span class="list-count" v-if="totalCount">共 {{ totalCount }} 条</span>
        <el-button size="small" :disabled="loading || recognizing || !!syncing" @click="load(page)">刷新与重新识别</el-button>
      </div>
      <p class="recognition-progress" role="status">{{ listType === 4 ? recognitionProgress : '自动识别在“已完成作业”列表运行；切换回该列表即可识别。' }}</p>

      <div v-loading="loading" class="list-body">
        <el-empty v-if="!loading && exams.length === 0" description="暂无测评任务" />
        <div
          v-for="e in exams"
          :key="examKey(e)"
          class="exam-row"
          @click="openQuestions(e)"
        >
          <el-icon class="row-icon"><Document /></el-icon>
          <span class="row-name">{{ e.examName }}</span>
          <div v-if="recognition[examKey(e)]?.status === 'ready' && reviewFor(e)" class="review-status" @click.stop>
            <span>本人错题 {{ reviewFor(e)!.questionIds.length }} 题<span v-if="reviewFor(e)!.unmatched">，{{ reviewFor(e)!.unmatched }} 题无法匹配</span></span>
            <el-button size="small" :disabled="!!syncing || !reviewFor(e)!.questionIds.length || !!reviewFor(e)!.unmatched" :loading="syncing === examKey(e)" @click="importWrong(e)">加入官方错题本</el-button>
            <small v-if="reviewFor(e)!.message">{{ reviewFor(e)!.message }}</small>
          </div>
          <div v-else-if="recognition[examKey(e)]" class="review-status" @click.stop>
            <span v-if="recognition[examKey(e)].status === 'error'" class="recognition-error">识别失败：{{ recognition[examKey(e)].error }}</span>
            <span v-else>{{ recognition[examKey(e)].status === 'reading' ? '正在识别本人错题…' : '等待自动识别…' }}</span>
          </div>
          <el-icon class="row-arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <div class="pager" v-if="totalPages > 1">
        <el-pagination
          layout="prev, pager, next, jumper, total"
          :total="totalCount"
          :page-size="PAGE_SIZE"
          :current-page="page"
          :disabled="!!syncing"
          background
          @current-change="goPage"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { getExamReview, setExamReviewMessage } from '@/utils/examReview'
import { recognizeExamTasks, type RecognitionState } from '@/utils/examAutoReview'
import { syncExamMistakes } from '@/utils/examMistakes'
import { accountKey } from '@/utils/localData'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, ArrowRight } from '@element-plus/icons-vue'
import { getExamTasks, PAGE_SIZE, type ExamTask } from '@/api/exam'

const router = useRouter()
const exams = ref<ExamTask[]>([])
const page = ref(1)
const totalCount = ref(0)
const loading = ref(false)
const listType = ref(4), syncing = ref('')
let abort: AbortController | undefined, requestAbort: AbortController | undefined
const recognition = ref<Record<string, RecognitionState>>({})
const recognizing = ref(false), recognitionProgress = ref('')
function reviewFor(e: ExamTask) { try { return getExamReview(Number(e.examTaskId || e.id)) } catch { return undefined } }
async function importWrong(e: ExamTask) {
  if (syncing.value) return
  const id = Number(e.examTaskId || e.id), key = accountKey()
  if (recognition.value[String(id)]?.status !== 'ready') return
  syncing.value = examKey(e); abort = new AbortController()
  try {
    const result = await syncExamMistakes(id, key, abort.signal)
    const message = result.pending ? `${result.pending} 题未同步，可重试` : `${result.total} 题已在官方错题本（本次新增 ${result.saved} 题）`
    await setExamReviewMessage(id, message, key)
    if (abort.signal.aborted || accountKey() !== key) return
    if (result.pending) ElMessage.warning(message); else ElMessage.success(message)
  } catch (error) {
    if (!abort.signal.aborted && accountKey() === key) { await setExamReviewMessage(id, (error as Error).message, key); ElMessage.error((error as Error).message) }
  } finally { syncing.value = '' }
}

const totalPages = computed(() => Math.ceil(totalCount.value / PAGE_SIZE))

function examKey(e: ExamTask): string {
  return String(e.examTaskId || e.id || e.examId || e.testPagerId || Math.random())
}

async function load(pageNo: number) {
  requestAbort?.abort(); const controller = requestAbort = new AbortController()
  const key = accountKey(), type = listType.value
  recognition.value = {}; recognizing.value = false; recognitionProgress.value = ''
  loading.value = true
  try {
    const res = await getExamTasks(pageNo, controller.signal, type)
    if (controller.signal.aborted || accountKey() !== key) return
    exams.value = res.items
    totalCount.value = res.totalCount
    page.value = pageNo
    loading.value = false
    if (type === 4) {
      const ids = res.items.map(e => Number(e.examTaskId || e.id))
      for (const id of ids) recognition.value[String(id)] = {status:'waiting'}
      recognizing.value = true
      recognitionProgress.value = `自动识别 0/${ids.length} 个作业`
      await recognizeExamTasks(ids, key, controller.signal,
        (id,state) => { recognition.value[String(id)] = state },
        (done,total) => { recognitionProgress.value = `自动识别 ${done}/${total} 个作业` })
      const failed = Object.values(recognition.value).filter(s => s.status === 'error').length
      recognitionProgress.value = `本页自动识别完成${failed ? `，${failed} 个作业读取失败，可刷新重试` : ''}`
    }
  } catch (e: any) {
    if (!controller.signal.aborted) ElMessage.error('加载测评任务失败：' + (e.message || e))
  } finally {
    if (requestAbort === controller) { loading.value = false; recognizing.value = false }
  }
}

function goPage(p: number) {
  load(p)
}

/* 打开某测评：跳转到试题详情独立页 */
function openQuestions(e: ExamTask) {
  const taskId = Number(e.examTaskId || e.id)
  router.push(`/exam/${taskId}${e.examName ? `?name=${encodeURIComponent(e.examName)}` : ''}`)
}

onActivated(() => load(page.value))
function stop() { abort?.abort(); requestAbort?.abort() }
onDeactivated(stop); onBeforeUnmount(stop)
</script>

<style scoped>
.exam-page {
  width: 100%;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
.flow-tip { margin-bottom: 18px; }
.recognition-progress { font-size:13px; color:var(--el-text-color-secondary); }
.recognition-error { color:var(--el-color-danger); }
.review-status { display:flex; align-items:center; gap:12px; flex-wrap:wrap; font-size:14px; }
.review-status small { width:100%; color:var(--el-text-color-secondary); }
.exam-row { flex-wrap:wrap; }
.list-card {
  border-radius: 8px;
}
.list-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap:wrap;
}
.list-title {
  font-size: 16px;
  font-weight: 600;
}
.list-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.exam-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: background 0.2s;
}
.exam-row:hover {
  background: var(--el-fill-color-light);
}
.exam-row.disabled {
  opacity: 0.6;
}
.row-icon {
  font-size: 18px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.row-name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-arrow {
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

@media (max-width: 767px) {
  .exam-page {
    margin: 0;
    padding: 0 8px;
  }
}
</style>

<template>
  <div class="exam-page">
    <!-- 列表卡片 -->
    <el-card class="list-card" shadow="never">
      <div class="list-head">
        <el-tabs v-model="listType" @tab-change="load(1)">
          <el-tab-pane label="已完成作业" :name="4" />
          <el-tab-pane label="待处理作业" :name="1" />
          <el-tab-pane label="全部作业" :name="2" />
        </el-tabs>
      </div>

      <div v-loading="loading" class="list-body" v-infinite-scroll="loadMore" :infinite-scroll-disabled="loading || noMore" :infinite-scroll-immediate="false">
        <el-empty v-if="!loading && exams.length === 0" description="暂无测评任务" />
        <div
          v-for="e in exams"
          :key="examKey(e)"
          class="exam-row"
          @click="openQuestions(e)"
        >
          <el-icon class="row-icon"><Document /></el-icon>
          <span class="row-name">{{ e.examName }}</span>
          <el-icon class="row-arrow"><ArrowRight /></el-icon>
        </div>
        <div class="load-more" v-if="!noMore && exams.length > 0">
          <el-button link :disabled="loading" @click="loadMore">加载更多</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { accountKey } from '@/utils/localData'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, ArrowRight } from '@element-plus/icons-vue'
import { getExamTasks, type ExamTask } from '@/api/exam'

const router = useRouter()
const exams = ref<ExamTask[]>([])
const page = ref(1)
const totalCount = ref(0)
const loading = ref(false)
const listType = ref(4)
let requestAbort: AbortController | undefined

const noMore = computed(() => exams.value.length >= totalCount.value && totalCount.value > 0)

function examKey(e: ExamTask): string {
  return String(e.examTaskId || e.id || e.examId || e.testPagerId || Math.random())
}

async function load(pageNo: number, append = false) {
  requestAbort?.abort(); const controller = requestAbort = new AbortController()
  const key = accountKey()

  if (!append) {
    exams.value = []
    page.value = 1
  }

  loading.value = true
  try {
    const res = await getExamTasks(pageNo, controller.signal, listType.value)
    if (controller.signal.aborted || accountKey() !== key) return

    if (append) {
      exams.value = [...exams.value, ...res.items]
    } else {
      exams.value = res.items
    }
    totalCount.value = res.totalCount
    page.value = pageNo
  } catch (e: any) {
    if (!controller.signal.aborted) ElMessage.error('加载测评任务失败：' + (e.message || e))
  } finally {
    if (requestAbort === controller) loading.value = false
  }
}

function loadMore() {
  if (noMore.value || loading.value) return
  load(page.value + 1, true)
}

/* 打开某测评：跳转到试题详情独立页 */
function openQuestions(e: ExamTask) {
  const taskId = Number(e.examTaskId || e.id)
  router.push(`/exam/${taskId}${e.examName ? `?name=${encodeURIComponent(e.examName)}` : ''}`)
}

onActivated(() => load(1))
function stop() { requestAbort?.abort() }
onDeactivated(stop); onBeforeUnmount(stop)
</script>

<style scoped>
.exam-page {
  width: 100%;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
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
.load-more {
  padding: 16px;
  text-align: center;
}
.list-body {
  max-height: calc(100vh - 240px);
  overflow-y: auto;
}

@media (max-width: 767px) {
  .exam-page {
    margin: 0;
    padding: 0 8px;
  }
}
</style>

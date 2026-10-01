<template>
  <div class="exam-page">
    <PersonalMistakes :tasks="exams" />
    <!-- 列表卡片 -->
    <el-card class="list-card" shadow="never">
      <div class="list-head">
        <span class="list-title">学生测评任务</span>
        <span class="list-count" v-if="totalCount">共 {{ totalCount }} 条</span>
      </div>

      <div v-loading="loading" class="list-body">
        <el-empty v-if="!loading && exams.length === 0" description="暂无测评任务" />
        <div
          v-for="e in exams"
          :key="examKey(e)"
          class="exam-row"
          :class="{ disabled: e.examState == 2 }"
          @click="openQuestions(e)"
        >
          <el-icon class="row-icon"><Document /></el-icon>
          <span class="row-name">{{ e.examName }}</span>
          <el-tag v-if="e.examState == 2" type="info" size="small" effect="plain">已结束</el-tag>
          <el-icon class="row-arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <div class="pager" v-if="totalPages > 1">
        <el-pagination
          layout="prev, pager, next, jumper, total"
          :total="totalCount"
          :page-size="PAGE_SIZE"
          :current-page="page"
          background
          @current-change="goPage"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PersonalMistakes from '@/components/PersonalMistakes.vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, ArrowRight } from '@element-plus/icons-vue'
import { getExamTasks, PAGE_SIZE, type ExamTask } from '@/api/exam'

const router = useRouter()
const exams = ref<ExamTask[]>([])
const page = ref(1)
const totalCount = ref(0)
const loading = ref(false)

const totalPages = computed(() => Math.ceil(totalCount.value / PAGE_SIZE))

function examKey(e: ExamTask): string {
  return String(e.examTaskId || e.id || e.examId || e.testPagerId || Math.random())
}

async function load(pageNo: number) {
  loading.value = true
  try {
    const res = await getExamTasks(pageNo)
    exams.value = res.items
    totalCount.value = res.totalCount
    page.value = pageNo
  } catch (e: any) {
    ElMessage.error('加载测评任务失败：' + (e.message || e))
  } finally {
    loading.value = false
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

onMounted(() => load(1))
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

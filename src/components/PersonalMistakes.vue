<template>
  <el-card class="personal-mistakes" shadow="never">
    <template #header>
      <div class="toolbar"><strong>我的测评错题</strong><el-tag>{{ items.length }} 题</el-tag>
        <el-button v-if="tasks?.length" :loading="mistakeSyncState.busy" @click="collect">重新核对并同步官方</el-button>
        <el-button v-if="tasks !== undefined" :disabled="mistakeSyncState.busy" :loading="loadingAll" @click="collectAll">批量收集全部测评错题</el-button>
        <el-button v-if="mistakeSyncState.busy || loadingAll" @click="scanAbort?.abort()">停止核对</el-button>
        <el-button @click="refresh">刷新本地记录</el-button>
      </div>
    </template>
    <p class="muted">仅收集当前账号已公布分数的失分题；原始成绩用于判断，订正后的满分不会抹去原错题。先本地保存，再加入中育官方错题本。</p>
    <p v-if="mistakeSyncState.message" role="status">{{ mistakeSyncState.message }}</p>
    <div class="toolbar">
      <el-select v-model="subject" placeholder="选择科目" style="width:180px"><el-option label="全部科目" value="" /><el-option v-for="name in subjects" :key="name" :label="name" :value="name" /></el-select>
      <el-checkbox v-model="includeAnswers">附答案与解析</el-checkbox>
      <el-button :disabled="!subject || !filtered.length" :loading="exporting" @click="exportPdf">导出当前科目 PDF</el-button>
      <el-button v-if="exporting" @click="exportAbort?.abort()">取消导出</el-button>
      <span>{{ exportProgress }}</span>
    </div>
    <el-empty v-if="!filtered.length" description="暂无已识别的本人错题" />
    <div v-for="item in paged" :key="item.id" class="wrong-row">
      <button class="wrong-title" @click="open(item)">{{ item.subject }} · {{ item.source }} · {{ item.number || '题目' }}</button>
      <span>{{ item.earned }}/{{ item.full }} 分</span>
      <el-tooltip :content="item.syncError || '已加入中育官方错题本'"><el-tag :type="item.sync === 'synced' ? 'success' : 'warning'">{{ item.sync === 'synced' ? '已同步官方' : '本地已保存 · 待同步' }}</el-tag></el-tooltip>
    </div>
    <el-pagination v-if="filtered.length > 20" v-model:current-page="page" :page-size="20" :total="filtered.length" layout="prev,pager,next,total" />
  </el-card>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { collectExamTasks, listLocalMistakes, mistakeSyncState, type LocalMistake } from '@/utils/examMistakes'
import { createMistakePdf } from '@/utils/mistakePdf'
import { saveBlobFile } from '@/utils/saveFile'
import { useAuthStore } from '@/stores/auth'
import { getExamTasks } from '@/api/exam'
import { accountKey } from '@/utils/localData'
const props = defineProps<{ tasks?: any[] }>()
const auth = useAuthStore(), router = useRouter()
const items = ref<LocalMistake[]>([]), subject = ref(''), page = ref(1)
const subjects = computed(() => [...new Set(items.value.map(item => item.subject))].sort())
const filtered = computed(() => items.value.filter(item => !subject.value || item.subject === subject.value))
const paged = computed(() => filtered.value.slice((page.value - 1) * 20, page.value * 20))
const includeAnswers = ref(true), exporting = ref(false), exportProgress = ref('')
const loadingAll = ref(false)
let scanAbort: AbortController | undefined, exportAbort: AbortController | undefined
let active = true
async function refresh() {
  const key = auth.userId && auth.apiBaseUrl ? accountKey() : ''
  if (!key) { items.value = []; return }
  try { const list = await listLocalMistakes(key); if (active && key === accountKey()) items.value = list.sort((a,b) => b.creationTime.localeCompare(a.creationTime)) }
  catch (e) { items.value = []; if (auth.isLoggedIn) ElMessage.error((e as Error).message) }
}
async function collect() {
  if (!active || !props.tasks?.length || loadingAll.value) return
  const controller = new AbortController(); scanAbort = controller
  try { await collectExamTasks([...props.tasks], controller.signal); await refresh() }
  catch (e) { if (!controller.signal.aborted) ElMessage.error((e as Error).message) }
}
async function collectAll() {
  if (loadingAll.value || mistakeSyncState.busy) return
  const key = accountKey(), controller = new AbortController(); scanAbort = controller; loadingAll.value = true
  try {
    const tasks: any[] = [], seen = new Set<number>()
    for (let n = 1; ; n++) {
      const result = await getExamTasks(n, controller.signal)
      if (controller.signal.aborted || accountKey() !== key) throw new Error('核对已取消或账号已切换')
      if (!result.items.length) break
      for (const item of result.items) {
        const id = Number(item.examTaskId || item.id)
        if (!Number.isSafeInteger(id) || id <= 0) continue
        if (seen.has(id)) throw new Error('官方测评分页重复，请稍后重试')
        seen.add(id); tasks.push(item)
      }
      if (n * 20 >= result.totalCount) break
      if (n >= 1000) throw new Error('测评数量过多，请分批核对')
    }
    await collectExamTasks(tasks, controller.signal); await refresh()
  } catch (e) { if (!controller.signal.aborted) ElMessage.error((e as Error).message) }
  finally { loadingAll.value = false }
}
function open(item: LocalMistake) { router.push({ path: `/mistake/${item.id}`, query: { source: item.source } }) }
async function exportPdf() {
  if (exporting.value || !subject.value) return
  exporting.value = true; exportAbort = new AbortController()
  const key = accountKey()
  const selected = subject.value, questions = filtered.value.map(item => ({title: item.source + ' · ' + item.number, ...item}))
  try {
    const pdf = await createMistakePdf(selected, questions, includeAnswers.value, (n,total) => exportProgress.value = `${n}/${total}`, exportAbort.signal)
    if (exportAbort.signal.aborted || accountKey() !== key) throw new Error('导出已取消或账号已切换')
    await saveBlobFile(pdf, selected.replace(/[<>:"/\\|?*]/g, '_') + '-测评错题.pdf')
    ElMessage.success('科目错题 PDF 已保存')
  } catch (e) { ElMessage.error((e as Error).message) }
  finally { exporting.value = false; exportProgress.value = '' }
}
watch(() => props.tasks, () => { if (!loadingAll.value) { scanAbort?.abort(); collect() } })
watch(() => mistakeSyncState.revision, refresh)
watch(() => [auth.userId, auth.apiBaseUrl], () => { scanAbort?.abort(); exportAbort?.abort(); items.value = []; refresh() })
watch(subject, () => page.value = 1)
onMounted(refresh)
onActivated(() => { active = true; refresh(); collect() })
onDeactivated(() => { active = false; scanAbort?.abort(); exportAbort?.abort() })
onBeforeUnmount(() => { active = false; scanAbort?.abort(); exportAbort?.abort() })
</script>
<style scoped>
.personal-mistakes { margin-bottom: 20px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.toolbar .el-button { margin: 0; }
.muted { color: var(--el-text-color-secondary); line-height: 1.7; }
.wrong-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--el-border-color-light); }
.wrong-title { flex: 1; min-width: 180px; text-align: left; cursor: pointer; color: var(--el-color-primary); background: none; border: 0; font: inherit; }
</style>

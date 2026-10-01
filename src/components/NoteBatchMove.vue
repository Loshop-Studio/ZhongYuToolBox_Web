<template>
  <el-button :disabled="!ids.length || busy" @click="open">移动所选笔记（{{ ids.length }}）</el-button>
  <el-dialog v-model="visible" title="批量移动笔记" width="min(620px, 92vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy">
    <p>将 {{ ids.length }} 条笔记移到所选文件夹，原有内容和名称保持不变。</p>
    <el-breadcrumb separator="/" class="destination-crumb">
      <el-breadcrumb-item v-for="(folder, index) in path" :key="folder.id"><el-button link :disabled="busy" @click="path = path.slice(0, index + 1)">{{ folder.name }}</el-button></el-breadcrumb-item>
    </el-breadcrumb>
    <div v-loading="loading" class="folder-list">
      <el-button v-for="folder in folders" :key="folder.fileId" :disabled="busy" class="folder-choice" @click="path.push({ id:folder.fileId, name:folder.fileName })"><el-icon><Folder /></el-icon>{{ folder.fileName }}<el-icon class="forward"><ArrowRight /></el-icon></el-button>
      <el-empty v-if="!loading && !folders.length" description="此目录没有子文件夹，可直接移到这里" :image-size="60" />
    </div>
    <p>目标：{{ path.map(item => item.name).join(' / ') }}</p>
    <el-progress v-if="busy || done" :percentage="total ? Math.round(done / total * 100) : 0" />
    <p v-if="summary" role="status">{{ summary }}</p>
    <el-alert v-for="failure in failures" :key="failure.id" :title="failure.name + '：' + failure.error" type="error" :closable="false" />
    <template #footer>
      <el-button v-if="busy" @click="controller?.abort()">停止后续移动</el-button><el-button v-else @click="visible = false">关闭</el-button>
      <el-button type="primary" :disabled="loading || !ids.length" :loading="busy" @click="move">移到这里</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onDeactivated, onBeforeUnmount } from 'vue'
import { Folder, ArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getAllNoteNodes, moveNotesToFolder, type NoteItem, type NoteMoveResult } from '@/api/note'
import { accountKey } from '@/utils/localData'
const props = defineProps<{ ids:string[] }>()
const emit = defineEmits<{ moved:[ids:string[]]; busy:[value:boolean] }>()
const visible = ref(false), loading = ref(false), busy = ref(false), done = ref(0), total = ref(0), summary = ref('')
const nodes = ref<NoteItem[]>([]), failures = ref<NoteMoveResult['failed']>([])
const path = ref([{id:'0',name:'根目录'}])
const folders = computed(() => nodes.value.filter(n => n.type === 0 && String(n.parentId || '0') === path.value.at(-1)!.id).sort((a,b) => a.fileName.localeCompare(b.fileName,'zh-CN')))
let controller: AbortController | undefined
async function open() {
  const key = accountKey(); visible.value = true; loading.value = true; summary.value = ''; failures.value = []; done.value = 0; path.value = [{id:'0',name:'根目录'}]
  controller?.abort(); const current = controller = new AbortController()
  try { const list = await getAllNoteNodes(current.signal); if (!current.signal.aborted && accountKey() === key) nodes.value = list }
  catch(error) { if (!current.signal.aborted) { visible.value = false; ElMessage.error((error as Error).message) } }
  finally { if (controller === current) loading.value = false }
}
async function move() {
  if (busy.value) return
  const ids = [...props.ids], destination = path.value.at(-1)!.id, key = accountKey()
  busy.value = true; emit('busy',true); done.value = 0; total.value = ids.length; summary.value = ''; failures.value = []
  const current = controller = new AbortController(); let moved:string[] = [], skipped:string[] = []
  try {
    const result = await moveNotesToFolder(ids,destination,{signal:current.signal,onProgress:(completed, count, state) => {
      done.value = completed; total.value = count; moved = [...state.moved]; skipped = [...state.skipped]; failures.value = [...state.failed]
    }})
    summary.value = `已移动 ${result.moved.length} 条，已在目标目录 ${result.skipped.length} 条，失败 ${result.failed.length} 条`
    if (!result.failed.length) { ElMessage.success(summary.value); visible.value = false }
  } catch(error) { summary.value = `${(error as Error).message}；已确认移动 ${moved.length} 条，未完成的笔记保留勾选` }
  finally {
    busy.value = false; emit('busy',false)
    try { if (accountKey() === key) emit('moved',[...moved,...skipped]) } catch { /* Logout has already discarded this view. */ }
  }
}
onDeactivated(() => { controller?.abort(); visible.value = false })
onBeforeUnmount(() => controller?.abort())
</script>
<style scoped>
.destination-crumb { margin:20px 0; }
.folder-list { min-height:150px; max-height:300px; overflow:auto; }
.folder-choice { width:100%; display:flex; justify-content:flex-start; margin:4px 0 !important; gap:10px; }
.forward { margin-left:auto; }
.el-alert { margin-top:8px; }
</style>

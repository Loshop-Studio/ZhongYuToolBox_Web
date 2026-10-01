<template>
  <div v-loading="loading" class="note-recycle">
    <div class="toolbar"><span>共 {{ notes.length }} 条回收站笔记</span><el-button :disabled="busy || loading" @click="load">刷新回收站</el-button></div>
    <p class="hint">这里只列出回收站中的笔记。永久删除后无法恢复；如果需要恢复，请使用中育官方客户端。</p>
    <div class="toolbar">
      <el-checkbox :model-value="allSelected" :indeterminate="selected.length > 0 && !allSelected" :disabled="busy || !notes.length" @change="value => selected = value ? notes.map(n => n.fileId) : []">选择回收站笔记</el-checkbox>
      <el-button type="danger" plain :disabled="!selected.length || loading" :loading="busy" @click="remove(selected)">永久删除选中 {{ selected.length }} 条</el-button>
    </div>
    <el-empty v-if="!loading && !notes.length" description="笔记回收站为空" />
    <div v-for="note in notes" :key="note.fileId" class="recycle-row">
      <el-checkbox :model-value="selected.includes(note.fileId)" :disabled="busy" :aria-label="'选择回收站笔记 ' + note.fileName" @change="value => select(note.fileId, !!value)" />
      <div class="name"><strong>{{ note.fileName }}</strong><small>{{ note.updateTime || note.createTime || '' }}</small></div>
      <el-button type="danger" plain :disabled="busy || loading" @click="remove([note.fileId])">永久删除</el-button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onDeactivated } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getRecycledNotes, deleteRecycledNotes, type NoteItem } from '@/api/note'
import { accountKey } from '@/utils/localData'
const emit = defineEmits<{changed:[]}>()
const notes = ref<NoteItem[]>([]), selected = ref<string[]>([]), loading = ref(false), busy = ref(false)
const allSelected = computed(() => !!notes.value.length && notes.value.every(n => selected.value.includes(n.fileId)))
let read: AbortController | undefined, write: AbortController | undefined
function select(id: string, value: boolean) { selected.value = value ? [...new Set([...selected.value,id])] : selected.value.filter(n => n !== id) }
async function load() {
  read?.abort(); const current = read = new AbortController(), key = accountKey(); loading.value = true
  try { const data = await getRecycledNotes(current.signal); if (!current.signal.aborted && accountKey() === key) {notes.value = data; selected.value = selected.value.filter(id => data.some(n => n.fileId === id))} }
  catch (error) { if (!current.signal.aborted) ElMessage.error('读取回收站失败：' + (error as Error).message) }
  finally { if (read === current) loading.value = false }
}
async function remove(ids: string[]) {
  if (busy.value || loading.value) return
  const selection = [...new Set(ids)], key = accountKey(), current = write = new AbortController(); busy.value = true
  try {
    await ElMessageBox.confirm(`永久删除回收站中的 ${selection.length} 条笔记？删除后无法恢复。`, '永久删除笔记', {type:'warning',confirmButtonText:'永久删除',cancelButtonText:'取消'})
    if (current.signal.aborted || accountKey() !== key) return
    await deleteRecycledNotes(selection, current.signal)
    if (current.signal.aborted || accountKey() !== key) return
    notes.value = notes.value.filter(n => !selection.includes(n.fileId)); selected.value = selected.value.filter(id => !selection.includes(id))
    ElMessage.success(`已永久删除 ${selection.length} 条笔记`); emit('changed'); await load()
  } catch (error) { if (error !== 'cancel' && error !== 'close' && !current.signal.aborted) ElMessage.error('删除失败：' + (error as Error).message) }
  finally { if (write === current) busy.value = false }
}
function stop() {read?.abort(); write?.abort()}
onMounted(load); onBeforeUnmount(stop); onDeactivated(stop)
</script>
<style scoped>
.toolbar {display:flex;align-items:center;flex-wrap:wrap;gap:16px;margin:12px 0}
.hint {color:var(--el-text-color-secondary);line-height:1.8}
.recycle-row {display:flex;align-items:center;gap:16px;padding:16px 8px;border-bottom:1px solid var(--el-border-color)}
.name {flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}.name small{color:var(--el-text-color-secondary)}
</style>

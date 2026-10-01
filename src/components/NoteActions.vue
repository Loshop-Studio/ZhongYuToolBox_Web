<template>
  <div class="note-actions" @click.stop @keydown.stop>
    <el-button size="small" :disabled="busy" @click="rename">重命名</el-button>
    <el-button size="small" :loading="busy" @click="recycle">移至回收站</el-button>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { renameNote, moveNotesToRecycleBin, type NoteItem } from '@/api/note'
import { accountKey } from '@/utils/localData'
const props = defineProps<{ note: NoteItem }>()
const emit = defineEmits<{ changed: [] }>()
const busy = ref(false)
async function rename() {
  if (busy.value) return
  const key = accountKey(), note = props.note
  try {
    const { value } = await ElMessageBox.prompt('输入新的笔记名称', '重命名', {
      inputValue: props.note.fileName, inputValidator: value => !!value?.trim() || '名称不能为空'
    })
    busy.value = true
    if (key !== accountKey() || props.note !== note) throw new Error('账号或笔记已切换，请重试')
    await renameNote(note, value)
    ElMessage.success('已重命名'); emit('changed')
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(String((e as Error).message || e)) }
  finally { busy.value = false }
}
async function recycle() {
  if (busy.value) return
  const key = accountKey(), note = props.note
  try {
    await ElMessageBox.confirm(`将「${props.note.fileName}」移至中育回收站？可在官方客户端恢复。`, '移至回收站', { type: 'warning' })
    busy.value = true
    if (key !== accountKey() || props.note !== note) throw new Error('账号或笔记已切换，请重试')
    await moveNotesToRecycleBin([note.fileId])
    ElMessage.success('已移至官方回收站'); emit('changed')
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(String((e as Error).message || e)) }
  finally { busy.value = false }
}
</script>
<style scoped>
.note-actions { display: flex; gap: 8px; flex-shrink: 0; }
.note-actions .el-button { margin: 0; }
@media(max-width: 900px) { .note-actions { flex-wrap: wrap; } }
</style>

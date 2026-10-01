<template>
  <teleport to="body">
    <div class="nmask" :class="{ mobile }" @click="emit('close')" @contextmenu.prevent />
    <div v-if="!mobile" class="nmenu" :style="menuStyle">
      <button type="button" :disabled="busy" @click="rename">重命名</button>
      <button type="button" class="danger" :disabled="busy" @click="recycle">移至回收站</button>
    </div>
    <div v-else class="nsheet">
      <button type="button" :disabled="busy" @click="rename">重命名</button>
      <button type="button" class="danger" :disabled="busy" @click="recycle">移至回收站</button>
      <button type="button" class="cancel" @click="emit('close')">取消</button>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { renameNote, moveNotesToRecycleBin, type NoteItem } from '@/api/note'
import { accountKey } from '@/utils/localData'

const props = defineProps<{ note: NoteItem; x?: number; y?: number; mobile?: boolean }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const busy = ref(false)

const menuStyle = computed(() => {
  let left = props.x ?? 0
  let top = props.y ?? 0
  const width = 180
  const height = 96
  if (left + width > window.innerWidth) left = window.innerWidth - width - 8
  if (top + height > window.innerHeight) top = window.innerHeight - height - 8
  return { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }
})

async function rename() {
  if (busy.value) return
  const key = accountKey()
  const note = props.note
  try {
    const { value } = await ElMessageBox.prompt('输入新的笔记名称', '重命名', {
      inputValue: note.fileName,
      inputValidator: v => !!v?.trim() || '名称不能为空'
    })
    busy.value = true
    if (key !== accountKey() || props.note !== note) throw new Error('账号或笔记已切换，请重试')
    await renameNote(note, value)
    ElMessage.success('已重命名')
    emit('changed')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(String((e as Error).message || e))
  } finally {
    busy.value = false
  }
}

async function recycle() {
  if (busy.value) return
  const key = accountKey()
  const note = props.note
  try {
    await ElMessageBox.confirm(
      `将「${note.fileName}」移至中育回收站？可在官方客户端恢复。`,
      '移至回收站',
      { type: 'warning' }
    )
    busy.value = true
    if (key !== accountKey() || props.note !== note) throw new Error('账号或笔记已切换，请重试')
    await moveNotesToRecycleBin([note.fileId])
    ElMessage.success('已移至官方回收站')
    emit('changed')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(String((e as Error).message || e))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.nmask {
  position: fixed;
  inset: 0;
  z-index: 2000;
}
.nmask.mobile {
  background: rgba(0, 0, 0, 0.35);
}
.nmenu {
  position: fixed;
  z-index: 2001;
  min-width: 160px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  box-shadow: var(--el-box-shadow-light);
  padding: 6px;
  display: flex;
  flex-direction: column;
}
.nmenu button,
.nsheet button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.nmenu button:hover,
.nsheet button:hover {
  background: var(--el-fill-color-light);
}
.nmenu button:disabled,
.nsheet button:disabled {
  cursor: default;
  opacity: 0.6;
}
.nmenu button.danger,
.nsheet button.danger {
  color: var(--el-color-danger);
}
.nsheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2001;
  background: var(--el-bg-color);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.15);
  padding: 8px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nsheet button.cancel {
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color);
  margin-top: 4px;
  padding-top: 12px;
}
</style>

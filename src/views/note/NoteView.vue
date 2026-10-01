<template>
  <div class="note-view">
    <el-tabs v-model="activeTab" class="note-tabs" @tab-change="handleTabChange">
      <!-- 文件夹 -->
      <el-tab-pane label="文件夹" name="dir">
        <el-breadcrumb separator="/" class="crumb">
          <el-breadcrumb-item
            v-for="(item, index) in breadcrumb"
            :key="item.id"
            :class="{ clickable: index !== breadcrumb.length - 1 }"
            @click="jumpBreadcrumb(index)"
          >
            {{ item.name }}
          </el-breadcrumb-item>
        </el-breadcrumb>

        <div v-loading="dirLoading" class="list-wrap">
          <el-empty v-if="!dirLoading && dirNotes.length === 0" description="（此文件夹为空）" />
          <div
            v-for="note in dirNotes"
            :key="note.fileId"
            class="note-row"
            @click="handleDirItemClick(note)"
          >
            <div class="row-left">
              <el-icon class="row-icon" :class="note.type === 0 ? 'folder' : 'file'">
                <Folder v-if="note.type === 0" />
                <Document v-else />
              </el-icon>
              <div class="row-text">
                <strong>{{ note.fileName }}</strong>
                <small>创建时间: {{ note.createTime || '-' }}</small>
              </div>
            </div>
            <div class="row-end">
              <el-tag :type="note.type === 0 ? 'info' : 'primary'" round size="small">{{ note.type === 0 ? '文件夹' : '笔记' }}</el-tag>
              <NoteActions :note="note" @changed="refreshLists" />
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 全部笔记 -->
      <el-tab-pane label="全部笔记" name="all">
        <div class="tab-toolbar">
          <span class="count">共 {{ allNotes.length }} 条</span>
          <el-button :loading="allLoading" @click="loadAllNotes(true)">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
        <div v-loading="allLoading" class="list-wrap">
          <el-empty v-if="!allLoading && allNotes.length === 0" description="暂无笔记" />
          <div
            v-for="note in pagedAllNotes"
            :key="note.fileId"
            class="note-row"
            @click="openPreview(note)"
          >
            <div class="row-left">
              <el-icon class="row-icon file"><Document /></el-icon>
              <strong>{{ note.fileName }}</strong>
            </div>
            <small class="time">{{ note.updateTime || note.createTime }}</small>
            <NoteActions :note="note" @changed="refreshLists" />
          </div>
        </div>
        <el-pagination
          v-if="allNotes.length > pageSize"
          class="pager"
          layout="prev, pager, next, jumper, total"
          :total="allNotes.length"
          :page-size="pageSize"
          :current-page="allPage"
          background
          @current-change="allPage = $event"
        />
      </el-tab-pane>

      <!-- 搜索 -->
      <el-tab-pane label="搜索" name="search">
        <div class="search-bar">
          <span class="search-title">搜索笔记</span>
          <el-input
            v-model="searchKeyword"
            placeholder="输入笔记名称搜索"
            clearable
            class="search-input"
            @keyup.enter="doSearch"
          >
            <template #append>
              <el-button :loading="searchLoading" @click="doSearch">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
            </template>
          </el-input>
        </div>

        <div v-loading="searchLoading" class="list-wrap">
          <el-empty v-if="searched && searchResults.length === 0" description="没有找到笔记" />
          <div
            v-for="note in pagedSearchResults"
            :key="note.fileId"
            class="note-row"
            @click="openPreview(note)"
          >
            <div class="row-left">
              <el-icon class="row-icon file"><Document /></el-icon>
              <strong>{{ note.fileName }}</strong>
            </div>
            <small class="time">{{ note.updateTime || note.createTime }}</small>
            <NoteActions :note="note" @changed="refreshLists" />
          </div>
        </div>
        <el-pagination
          v-if="searchResults.length > pageSize"
          class="pager"
          layout="prev, pager, next, jumper, total"
          :total="searchResults.length"
          :page-size="pageSize"
          :current-page="searchPage"
          background
          @current-change="searchPage = $event"
        />
      </el-tab-pane>

      <!-- PDF 上传 -->
      <el-tab-pane label="PDF上传" name="pdf">
        <PdfUploadPanel />
      </el-tab-pane>
      <el-tab-pane label="图片上传" name="images" lazy><PdfUploadPanel source="images" /></el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Folder, Document, Search, Refresh } from '@element-plus/icons-vue'
import {
  getNotesByParentId,
  getAllNotes,
  searchNotes as searchNotesApi,
  type NoteItem
} from '@/api/note'
import PdfUploadPanel from './PdfUploadPanel.vue'
import NoteActions from '@/components/NoteActions.vue'

const router = useRouter()
async function refreshLists() {
  allLoaded.value = false
  await loadNotes(breadcrumb.value.at(-1)?.id || '0')
  if (activeTab.value === 'all') await loadAllNotes(true)
  if (activeTab.value === 'search' && searched.value) await doSearch()
}

const pageSize = 20

const activeTab = ref('dir')

/* ---------------- 文件夹 ---------------- */
const dirLoading = ref(false)
const dirNotes = ref<NoteItem[]>([])
const breadcrumb = ref<Array<{ id: string; name: string }>>([{ id: '0', name: '根目录' }])

async function loadNotes(parentId = '0') {
  dirLoading.value = true
  try {
    const list = await getNotesByParentId(parentId)
    // 文件夹优先 + 名称排序（复刻 renderNotes 排序）
    dirNotes.value = list.sort((a, b) => {
      if (a.type === 0 && b.type !== 0) return -1
      if (a.type !== 0 && b.type === 0) return 1
      return a.fileName.localeCompare(b.fileName, 'zh-Hans-CN')
    })
  } catch (e: any) {
    ElMessage.error(e.message || '获取笔记失败')
  } finally {
    dirLoading.value = false
  }
}

function handleDirItemClick(note: NoteItem) {
  if (note.type === 0) {
    breadcrumb.value.push({ id: note.fileId, name: note.fileName })
    loadNotes(note.fileId)
  } else {
    openPreview(note)
  }
}

function jumpBreadcrumb(index: number) {
  if (index === breadcrumb.value.length - 1) return
  const target = breadcrumb.value[index]
  breadcrumb.value = breadcrumb.value.slice(0, index + 1)
  loadNotes(target.id)
}

/* ---------------- 全部笔记 ---------------- */
const allLoading = ref(false)
const allNotes = ref<NoteItem[]>([])
const allPage = ref(1)

const pagedAllNotes = computed(() =>
  allNotes.value.slice((allPage.value - 1) * pageSize, allPage.value * pageSize)
)

/** 按 updateTime 倒序（复刻 shellsort 的排序效果） */
function sortByUpdateTimeDesc(list: NoteItem[]): NoteItem[] {
  return [...list].sort((a, b) => String(b.updateTime || '').localeCompare(String(a.updateTime || '')))
}

const allLoaded = ref(false)

async function loadAllNotes(force = false) {
  // 已成功加载过则复用缓存（复刻旧版 allNotes 缓存），失败时允许重试
  if (allLoaded.value && !force) return
  allLoading.value = true
  try {
    allNotes.value = sortByUpdateTimeDesc(await getAllNotes())
    allPage.value = 1
    allLoaded.value = true
  } catch (e: any) {
    ElMessage.error(e.message || '获取全部笔记失败')
  } finally {
    allLoading.value = false
  }
}

/* ---------------- 搜索 ---------------- */
const searchKeyword = ref('')
const searchLoading = ref(false)
const searched = ref(false)
const searchResults = ref<NoteItem[]>([])
const searchPage = ref(1)

const pagedSearchResults = computed(() =>
  searchResults.value.slice((searchPage.value - 1) * pageSize, searchPage.value * pageSize)
)

async function doSearch() {
  const kw = searchKeyword.value.trim()
  if (!kw) {
    ElMessage.warning('请输入搜索关键词')
    return
  }
  searchLoading.value = true
  try {
    searchResults.value = sortByUpdateTimeDesc(await searchNotesApi(kw))
    searchPage.value = 1
    searched.value = true
  } catch (e: any) {
    ElMessage.error(e.message || '搜索失败')
  } finally {
    searchLoading.value = false
  }
}

/* ---------------- 预览 ---------------- */
function openPreview(note: NoteItem) {
  router.push({
    name: 'note-detail',
    params: { fileId: note.fileId },
    query: { name: note.fileName }
  })
}

function handleTabChange(name: string | number) {
  if (name === 'all') loadAllNotes()
}

onMounted(() => loadNotes('0'))
</script>

<style scoped>
.note-view {
  padding: 16px;
}
.note-tabs {
  background: var(--el-bg-color);
  border-radius: 8px;
  padding: 12px 16px;
}
.crumb {
  margin: 8px 0 16px;
}
.crumb :deep(.clickable .el-breadcrumb__inner) {
  cursor: pointer;
  color: var(--el-color-primary);
}
.list-wrap {
  min-height: 200px;
}
.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.tab-toolbar .count {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.note-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: background 0.2s;
}
.note-row:hover {
  background: var(--el-fill-color-light);
}
.row-left {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.row-end { display:flex; align-items:center; gap:12px; }
.note-row { gap:12px; flex-wrap:wrap; }
.row-icon {
  font-size: 20px;
}
.row-icon.folder {
  color: var(--el-color-warning);
}
.row-icon.file {
  color: var(--el-color-primary);
}
.row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.row-text small {
  color: var(--el-text-color-secondary);
}
.time {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.pager {
  margin-top: 16px;
  justify-content: center;
}
.search-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 8px;
}
.search-title {
  font-size: 18px;
  font-weight: 600;
}
.search-input {
  max-width: 50%;
}

/* ===== 移动端适配 ===== */
@media (max-width: 767px) {
  .note-view {
    padding: 8px 4px;
  }
  .note-tabs {
    border-radius: 6px;
    padding: 8px 8px;
  }
  .note-row {
    padding: 10px 4px;
  }
  .note-row .time {
    display: none;
  }
  .tab-toolbar {
    margin-bottom: 4px;
  }
  .search-title {
    font-size: 15px;
  }
  .search-bar {
    flex-wrap: wrap;
    gap: 8px;
  }
  .search-input {
    max-width: 100%;
    flex: 1;
  }
  .pager {
    overflow-x: auto;
  }
}
</style>

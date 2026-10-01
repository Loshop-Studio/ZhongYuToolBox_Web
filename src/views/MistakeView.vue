<template>
  <div class="mistake-page">
    <PersonalMistakes />
    <div class="export-bar"><strong>中育官方错题本</strong><el-checkbox v-model="includeAnswers">附答案与解析</el-checkbox><el-button :disabled="!activeBookId" :loading="exporting" @click="exportSubject">导出当前科目 PDF</el-button><el-button v-if="exporting" @click="exportAbort?.abort()">取消</el-button><span>{{ exportProgress }}</span></div>
    <el-empty v-if="!booksLoading && books.length === 0" description="暂无错题本" />

    <el-tabs v-else v-model="activeBookId" class="mistake-tabs" @tab-change="onTabChange">
      <el-tab-pane v-for="b in books" :key="b.id" :label="b.topic.content" :name="String(b.id)">
        <div v-loading="loading" class="mistake-list">
          <el-empty v-if="!loading && list.length === 0" :description="`「${b.topic.content}」暂无错题`" />
          <div
            v-for="(item, idx) in list"
            :key="item.id"
            class="mistake-card"
            @click="openDetail(item)"
          >
            <div class="idx">{{ idx + 1 }}</div>
            <el-image :src="proxyImgSrc(item.stemShoot)" fit="cover" class="thumb">
              <template #error>
                <div class="thumb-ph"><el-icon><Picture /></el-icon></div>
              </template>
            </el-image>
            <div class="meta">
              <div class="src">{{ item.source || '未命名题目' }}</div>
              <div class="time">{{ item.creationTime }}</div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import PersonalMistakes from '@/components/PersonalMistakes.vue'
import { createMistakePdf, type ExportQuestion } from '@/utils/mistakePdf'
import { parseQuestionHtml } from '@/utils/questionHtml'
import { getMistakeDetail, fetchQstHtml } from '@/api/mistake'
import { saveBlobFile } from '@/utils/saveFile'
import { accountKey } from '@/utils/localData'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import { proxyImgSrc } from '@/utils/proxy'
import {
  getMyMistakeBooks,
  searchMistakes,
  type MistakeBook,
  type MistakeItem
} from '@/api/mistake'

const router = useRouter()
const includeAnswers = ref(true), exporting = ref(false), exportProgress = ref('')
let exportAbort: AbortController | undefined
async function exportSubject() {
  if (exporting.value) return
  const id = activeBookId.value, subject = books.value.find(b => String(b.id) === id)?.topic.content || '错题'
  const key = accountKey()
  exporting.value = true; exportAbort = new AbortController()
  const assertActive = () => { if (exportAbort?.signal.aborted || accountKey() !== key) throw new Error('导出已取消或账号已切换') }
  try {
    const items: MistakeItem[] = [], seen = new Set<string>()
    for (;;) {
      assertActive()
      const res = await searchMistakes(id, items.length, 200)
      if (!res.items?.length) break
      for (const item of res.items) { if (seen.has(String(item.id))) throw new Error('官方分页重复，请刷新后重试'); seen.add(String(item.id)); items.push(item) }
      if (items.length >= res.totalCount) break
    }
    if (!items.length) throw new Error('当前科目暂无错题')
    const questions: ExportQuestion[] = []
    for (const [index,item] of items.entries()) {
      assertActive(); exportProgress.value = '读取题目 ' + (index + 1) + '/' + items.length
      const detail = await getMistakeDetail(item.id)
      if (!detail) throw new Error('题目已删除：' + item.id)
      const parsed = detail.qstPath ? parseQuestionHtml(await fetchQstHtml(detail.qstPath)) : {stem:'', answer:'', analysis:''}
      const picture = detail.stemShoot || item.stemShoot
      if (!parsed.stem && picture) {
        const image = document.createElement('img'); image.src = picture; parsed.stem = image.outerHTML
      }
      if (!parsed.stem) throw new Error('题干为空，停止导出：' + item.id)
      questions.push({title: item.source || '错题', ...parsed})
    }
    assertActive()
    const pdf = await createMistakePdf(subject, questions, includeAnswers.value, (n,total) => exportProgress.value = '排版 ' + n + '/' + total, exportAbort.signal)
    assertActive(); await saveBlobFile(pdf, subject.replace(/[<>:"/\\|?*]/g,'_') + '-错题本.pdf')
    ElMessage.success('科目错题 PDF 已保存')
  } catch (e) { ElMessage.error((e as Error).message) }
  finally { exporting.value = false; exportProgress.value = '' }
}
onDeactivated(() => exportAbort?.abort())
onBeforeUnmount(() => exportAbort?.abort())
onActivated(() => { bookCache.value.clear(); initBooks() })
const booksLoading = ref(false)
const books = ref<MistakeBook[]>([])
const activeBookId = ref<string>('')
const loading = ref(false)
const list = ref<MistakeItem[]>([])
const bookCache = ref<Map<string, MistakeItem[]>>(new Map())

async function initBooks() {
  booksLoading.value = true
  try {
    const res = await getMyMistakeBooks()
    books.value = res || []
    if (books.value.length > 0) {
      activeBookId.value = String(books.value[0].id)
      await loadBook(activeBookId.value)
    }
  } catch (e: any) {
    ElMessage.error('加载错题本失败：' + (e.message || e))
  } finally {
    booksLoading.value = false
  }
}

async function loadBook(id: string) {
  if (bookCache.value.has(id)) {
    list.value = bookCache.value.get(id) || []
    return
  }
  loading.value = true
  try {
    const res = await searchMistakes(id, 0, 1000)
    const items = res.items || []
    bookCache.value.set(id, items)
    list.value = items
  } catch (e: any) {
    ElMessage.error('加载失败：' + (e.message || e))
  } finally {
    loading.value = false
  }
}

function onTabChange(name: string | number) {
  const id = String(name)
  activeBookId.value = id
  loadBook(id)
}

function openDetail(item: MistakeItem) {
  router.push({
    path: `/mistake/${item.id}`,
    query: { book: activeBookId.value, source: item.source }
  })
}


</script>

<style scoped>
.export-bar { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:16px; }
.mistake-page {
  max-width: 1100px;
  margin: 0 auto;
}
.mistake-tabs {
  --el-tabs-header-height: 48px;
}
.mistake-list {
  min-height: 160px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.mistake-card {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.1s ease;
}
.mistake-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}
.idx {
  flex-shrink: 0;
  width: 24px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.thumb {
  flex-shrink: 0;
  width: 88px;
  height: 88px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}
.thumb-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: var(--el-text-color-placeholder);
}
.meta {
  min-width: 0;
  flex: 1 1 auto;
}
.src {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 767px) {
  .mistake-page {
    padding: 0 4px;
  }
  .mistake-list {
    grid-template-columns: 1fr;
  }
}
</style>

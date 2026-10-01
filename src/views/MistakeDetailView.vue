<template>
  <div class="mistake-detail">
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ title || '错题详情' }}</span>
    </div>

    <div v-loading="loading" class="detail-body">
      <el-empty v-if="!loading && !hasContent" description="无详情内容" />
      <template v-if="!loading">
        <el-card v-if="qstHtml" class="block" header="题目">
          <div class="qst-html" v-html="qstHtml"></div>
        </el-card>
        <el-card v-if="ansHtml" class="block" header="答案">
          <div class="qst-html" v-html="ansHtml"></div>
        </el-card>
        <el-card v-if="expHtml" class="block" header="解析">
          <div class="qst-html" v-html="expHtml"></div>
        </el-card>
        <el-card v-if="noteImg" class="block" header="笔记">
          <el-image :src="noteImg" fit="contain" class="note-img" :preview-src-list="[noteImg]" preview-teleported hide-on-click-modal>
            <template #error>
              <div class="thumb-ph"><el-icon><Picture /></el-icon></div>
            </template>
          </el-image>
        </el-card>
        <el-card v-if="picNotes.length" class="block" header="图片笔记">
          <div class="pic-grid">
            <el-image
              v-for="(url, i) in picNotes"
              :key="i"
              :src="url"
              fit="contain"
              class="pic-item"
              :preview-src-list="picNotes"
              :initial-index="i"
              preview-teleported
              hide-on-click-modal
            >
              <template #error>
                <div class="thumb-ph"><el-icon><Picture /></el-icon></div>
              </template>
            </el-image>
          </div>
        </el-card>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Picture } from '@element-plus/icons-vue'
import { proxyUrl } from '@/utils/proxy'
import { listLocalMistakes } from '@/utils/examMistakes'
import {
  getMistakeDetail,
  fetchQstHtml,
  fetchNoteScreenshot
} from '@/api/mistake'

const route = useRoute()
const router = useRouter()

const itemId = computed(() => String(route.params.itemId || ''))
const title = computed(() => String(route.query.source || '错题详情'))

const loading = ref(false)
const qstHtml = ref('')
const ansHtml = ref('')
const expHtml = ref('')
const noteImg = ref('')
const picNotes = ref<string[]>([])

const hasContent = computed(
  () => !!qstHtml.value || !!ansHtml.value || !!expHtml.value || !!noteImg.value || picNotes.value.length > 0
)

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/mistake')
}

function parseQstHtml(html: string): { stem: string; answer: string; analysis: string } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const stem = doc.querySelector('.stem')?.innerHTML || ''

  let answer = ''
  const answerEl = doc.querySelector('.answers')
  if (answerEl) {
    answerEl.querySelectorAll('h3').forEach((h) => h.remove())
    answer = answerEl.innerHTML.trim()
  }

  let analysis = ''
  const analysisEls = doc.querySelectorAll('.analysis')
  if (analysisEls.length > 0) {
    const parts: string[] = []
    analysisEls.forEach((el) => {
      const clone = el.cloneNode(true) as HTMLElement
      clone.querySelectorAll('h3').forEach((h) => h.remove())
      const t = clone.innerHTML.trim()
      if (t) parts.push(t)
    })
    analysis = parts.join('<hr>')
  }
  return { stem, answer, analysis }
}

async function load() {
  if (!itemId.value) return
  loading.value = true
  qstHtml.value = ''
  ansHtml.value = ''
  expHtml.value = ''
  noteImg.value = ''
  picNotes.value = []
  try {
    const detail = await getMistakeDetail(itemId.value)
    if (!detail) {
      window.alert('该错题不存在或已删除')
      return
    }

    if (detail.qstPath) {
      try {
        const html = await fetchQstHtml(detail.qstPath)
        const parsed = parseQstHtml(html)
        qstHtml.value = parsed.stem
        ansHtml.value = parsed.answer
        expHtml.value = parsed.analysis
      } catch (e) {
        console.warn('获取题目失败', e)
      }
    }

    if (detail.note) {
      const url = await fetchNoteScreenshot(detail.note)
      if (url) noteImg.value = url
    }

    if (detail.pictureNote && detail.pictureNote.length > 0) {
      picNotes.value = detail.pictureNote.map((u: string) => proxyUrl(u))
    }
  } catch (e: any) {
    window.alert('加载详情失败：' + (e.message || e))
  } finally {
    loading.value = false
  }
}

onMounted(load)
// keep-alive 会复用同一组件实例，切换不同错题时需重新加载
watch(
  () => [route.params.itemId, route.query.source],
  () => load()
)
</script>

<style scoped>
.mistake-detail {
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.appbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 16px;
  margin-bottom: 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}
.appbar .back {
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
  color: var(--el-text-color-regular);
}
.appbar-title {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-body {
  flex: 1 1 auto;
  min-height: 60vh;
}
.block {
  margin-bottom: 12px;
}
.qst-html :deep(img) {
  max-width: 100%;
  height: auto;
}
.note-img {
  max-width: 100%;
  max-height: 360px;
}
.pic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.pic-item {
  width: 100%;
  height: 120px;
  border-radius: 6px;
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

@media (max-width: 767px) {
  .mistake-detail {
    padding: 0;
  }
  .appbar {
    margin-bottom: 8px;
    padding: 0 10px;
  }
}
</style>

<template>
  <div class="quora-page">
    <!-- 筛选区 -->
    <div class="filter-card">
      <el-tabs v-model="activeCatalog" class="catalog-tabs" @tab-change="onCatalogChange">
        <el-tab-pane v-for="c in catalogs" :key="c.id" :label="c.name" :name="String(c.id)" />
      </el-tabs>

      <div class="filter-row">
        <el-select v-model="subject" placeholder="学科" clearable class="f-subject">
          <el-option v-for="[id, name] in SUBJECTS" :key="id" :label="name" :value="id" />
        </el-select>
        <el-input v-model="keyword" placeholder="关键词" class="f-keyword" clearable @keyup.enter="reload" />
        <el-date-picker v-model="updateRange" type="daterange" range-separator="~" start-placeholder="更新起" end-placeholder="更新止" value-format="YYYY-MM-DD" class="f-date" />
        <el-date-picker v-model="joinRange" type="daterange" range-separator="~" start-placeholder="参与起" end-placeholder="参与止" value-format="YYYY-MM-DD" class="f-date" />
        <el-select v-model="watchMode" class="f-watch">
          <el-option label="全部" :value="0" />
          <el-option label="未回复" :value="3" />
          <el-option label="已回复" :value="2" />
          <el-option label="我关注的" :value="1" />
        </el-select>
        <el-button type="primary" :icon="Search" :loading="loading" @click="reload">搜索</el-button>
      </div>
    </div>

    <!-- 卡片网格列表（复刻旧 index.js ques-card 样式） -->
    <div class="list-wrap" ref="listWrapRef" v-loading="loading">
      <el-empty v-if="!loading && sessions.length === 0" description="没有匹配的会话" />
      <div class="card-grid">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="ques-card col-12 col-md-6 col-lg-4"
          @click="openSession(s)"
        >
          <div v-if="s.unRead && !isRead(s.id)" class="ques-unread-ribbon">未读</div>
          <div class="card-body d-flex align-items-center mb-2">
            <img
              :src="s.askUserPhoto || defaultAvatar"
              class="avatar me-2"
              alt="头像"
            />
            <div class="overflow-hidden">
              <div class="fw-bold">{{ s.askUserName }}</div>
              <div class="text-secondary small">{{ s.topicName || '未知学科' }}<span class="sep"> | </span>{{ s.summary || '未命名' }}</div>
            </div>
          </div>
          <div class="card-img-container">
            <img :src="proxyImgSrc(s.snapshot)" class="card-img-bottom w-100" alt="快照" />
          </div>
        </div>
      </div>
      <div v-if="sessions.length && !allLoaded" ref="sentinel" class="load-more">
        <el-icon v-if="loadingMore" class="rotating"><Loading /></el-icon>
        <span v-else>加载更多...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Loading } from '@element-plus/icons-vue'
import { SUBJECTS } from '@/config'
import { proxyImgSrc } from '@/utils/proxy'
import { getCatalogs, getSessions, readSessionState, type QuoraCatalog, type QuoraSession } from '@/api/quora'

const defaultAvatar = 'https://s4.anilist.co/file/anilistcdn/user/avatar/large/default.png'
const TAKE = 12
const router = useRouter()

/** 该会话是否已读（列表被 keep-alive 缓存，需手动跟踪已读状态） */
function isRead(id: string | number): boolean {
  return !!readSessionState[String(id)]
}

/** 离开/返回时手动保存与恢复列表滚动位置 */
let savedScrollTop = 0

const catalogs = ref<QuoraCatalog[]>([])
const activeCatalog = ref<string>('')
const subject = ref<number | ''>('')
const keyword = ref('')
const updateRange = ref<[string, string] | null>(null)
const joinRange = ref<[string, string] | null>(null)
const watchMode = ref(0)

const loading = ref(false)
const loadingMore = ref(false)
const allLoaded = ref(false)
const sessions = ref<QuoraSession[]>([])
const skip = ref(0)
const sentinel = ref<HTMLElement | null>(null)

function buildParams() {
  const justWatch = watchMode.value === 0 ? [1, 2, 3, 4] : [watchMode.value]
  return {
    keyword: keyword.value.trim(),
    catalogId: Number(activeCatalog.value) || 0,
    topicId: subject.value === '' ? 0 : (subject.value as number),
    orderBy: 0,
    skip: skip.value,
    take: TAKE,
    updateTime: {
      start: updateRange.value ? updateRange.value[0] + 'T00:00:00' : '',
      end: updateRange.value ? updateRange.value[1] + 'T23:59:59' : ''
    },
    joinTime: {
      start: joinRange.value ? joinRange.value[0] + 'T00:00:00' : '',
      end: joinRange.value ? joinRange.value[1] + 'T23:59:59' : ''
    },
    justWatch: justWatch as number[]
  }
}

async function loadSessions(reset: boolean) {
  if (reset) {
    skip.value = 0
    allLoaded.value = false
    sessions.value = []
  }
  if (allLoaded.value) return
  if (reset) loading.value = true
  else loadingMore.value = true
  try {
    const list = await getSessions(buildParams())
    if (list.length < TAKE) allLoaded.value = true
    sessions.value.push(...list)
    skip.value += list.length
    await fillViewport()
  } catch (e: any) {
    ElMessage.error('加载失败：' + (e.message || e))
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function reload() {
  loadSessions(true)
}

async function onCatalogChange() {
  reload()
}

async function openSession(s: QuoraSession) {
  router.push(`/quora/${s.id}`)
}

const listWrapRef = ref<HTMLElement | null>(null)

// 滚动懒加载（监听列表内部滚动容器 .list-wrap）
function getScrollEl(): HTMLElement | null {
  return listWrapRef.value
}
function onScroll() {
  if (loadingMore.value || allLoaded.value || loading.value) return
  const el = getScrollEl()
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
    loadSessions(false)
  }
}
// 首屏/每次加载后若未填满可视区，自动续加载，避免列表过短无法触发滚动懒加载
async function fillViewport() {
  await nextTick()
  const el = getScrollEl()
  if (!el) return
  let guard = 0
  while (
    !allLoaded.value &&
    !loading.value &&
    !loadingMore.value &&
    el.scrollHeight <= el.clientHeight + 120 &&
    guard < 30
  ) {
    guard++
    await loadSessions(false)
  }
}

onMounted(async () => {
  try {
    catalogs.value = await getCatalogs()
    if (catalogs.value.length) activeCatalog.value = String(catalogs.value[0].id)
  } catch (e: any) {
    ElMessage.error('加载领域失败：' + (e.message || e))
  }
  await loadSessions(true)
})
onActivated(async () => {
  const el = getScrollEl()
  el?.removeEventListener('scroll', onScroll)
  el?.addEventListener('scroll', onScroll, { passive: true })
  // 恢复离开前的滚动位置
  await nextTick()
  if (el) el.scrollTop = savedScrollTop
})
onDeactivated(() => {
  const el = getScrollEl()
  if (el) savedScrollTop = el.scrollTop
  el?.removeEventListener('scroll', onScroll)
})
onBeforeUnmount(() => getScrollEl()?.removeEventListener('scroll', onScroll))
</script>

<style scoped>
.quora-page {
  width: 100%;
  margin: 0 -20px;
  padding: 0 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.filter-card {
  margin-bottom: 12px;
}
.catalog-tabs {
  --el-tabs-header-height: 44px;
}
.filter-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.f-subject {
  width: 140px;
}
.f-keyword {
  width: 200px;
}
.f-date {
  width: 230px;
}
.f-watch {
  width: 130px;
}
.list-wrap {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  padding-bottom: 12px;
}
.ques-card {
  position: relative;
  cursor: pointer;
  background: var(--el-bg-color);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  border-radius: 3px;
  overflow: hidden;
  transition: box-shadow 0.2s, transform 0.2s;
}
.ques-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  transform: translateY(-2px);
}
.ques-unread-ribbon {
  position: absolute;
  top: 10px;
  right: -28px;
  transform: rotate(45deg);
  background: #f56c6c;
  color: #fff;
  font-size: 12px;
  padding: 2px 32px;
  z-index: 2;
}
.ques-card .card-body {
  padding: 10px 12px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}
.ques-card .avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  margin-right: 8px;
  background: var(--el-fill-color-light);
}
.ques-card .overflow-hidden {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ques-card .fw-bold {
  font-weight: 600;
  font-size: 15px;
  line-height: 18px;
}
.ques-card .text-secondary {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.ques-card .text-secondary .sep {
  color: var(--el-text-color-placeholder);
}
.ques-card .card-img-container {
  position: relative;
  width: 100%;
  padding-top: 66.6667%; /* 3:2 */
  overflow: hidden;
  background: var(--el-fill-color-light);
}
.ques-card .card-img-bottom {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.load-more {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.rotating {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 767px) {
  .quora-page {
    margin: 0;
    padding: 0 8px;
  }
  .card-grid {
    grid-template-columns: 1fr;
    max-width: 420px;
    margin: 0 auto;
  }
}
</style>

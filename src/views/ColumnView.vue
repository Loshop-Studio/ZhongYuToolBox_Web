<template>
  <div class="column-page">
    <!-- 移动端专属顶栏（桌面隐藏）：对齐主框架的移动端顶栏
         左侧 Menu 打开侧栏抽屉，中间标题，右侧加速标签 + 在新页面打开 -->
    <header class="col-mobile-bar">
      <el-button text :icon="Menu" class="col-mb-menu" @click="openDrawer" />
      <span class="col-mb-title">在线专栏</span>
      <div class="col-mb-right">
        <el-tag v-if="proxyLocal" type="success" size="small" effect="dark">加速</el-tag>
        <el-button
          text
          type="primary"
          :icon="TopRight"
          @click="openInNewTab"
        >打开</el-button>
      </div>
    </header>
    <!-- 顶部：tab 切换 + 搜索 + 在新页面打开 -->
    <div class="col-header">
      <div class="col-tabs">
        <span
          v-for="tab in tabs"
          :key="tab.key"
          class="col-tab"
          :class="{ active: activePanel === tab.key }"
          @click="activePanel = tab.key"
        >
          {{ tab.label }}
          <el-badge
            v-if="tab.key === 'messages' && unreadCount > 0"
            :value="unreadCount"
            class="col-tab-badge"
          />
        </span>
      </div>

      <!-- 浏览专栏时显示搜索栏 -->
      <template v-if="activePanel === 'browse'">
        <div class="col-search-row">
          <el-input
            v-model="topicKeyword"
            size="default"
            placeholder="请输入专栏名称"
            clearable
            class="col-search-topic"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-input
            v-model="searchKeyword"
            size="default"
            placeholder="请输入文章名称"
            clearable
            class="col-search-article"
            @keyup.enter="loadPages(true)"
            @clear="loadPages(true)"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
      </template>

      <div class="col-header-right">
        <el-button
          type="primary"
          plain
          :icon="TopRight"
          @click="openInNewTab"
        >在新页面打开</el-button>
      </div>
    </div>

    <div class="col-body">
      <!-- ====== 我的订阅 / 浏览专栏 ====== -->
      <template v-if="activePanel === 'browse'">
        <!-- 左侧学科树 -->
        <div class="col-side">
          <el-scrollbar class="col-side-scroll">
            <div
              v-for="t in filteredTopics"
              :key="'t-' + t.topicId"
              class="col-topic-group"
            >
              <div
                class="col-topic-name"
                :class="{ expanded: expandedTopics.has(t.topicId) }"
                @click="toggleTopic(t.topicId)"
              >
                {{ t.topicName }}
                <el-icon class="col-topic-arrow"><ArrowDown /></el-icon>
              </div>
              <div v-show="expandedTopics.has(t.topicId)" class="col-cols">
                <div
                  v-for="c in t.cols"
                  :key="c.id"
                  class="col-col-item"
                  :class="{ active: c.id === selectedColId }"
                  @click="selectColumn(c, t.topicName)"
                >{{ c.name }}</div>
              </div>
            </div>
          </el-scrollbar>
        </div>

        <!-- 右侧文章列表 -->
        <div class="col-main">
          <el-scrollbar v-loading="loadingPages" class="col-list-scroll">
            <div v-if="!selectedColId" class="col-empty">
              <el-empty description="从左侧选择学科下的专栏开始浏览" />
            </div>
            <div v-else-if="pages.length === 0 && !loadingPages" class="col-empty">
              <el-empty description="该专栏暂无文章" />
            </div>
            <div v-else class="col-page-list">
              <div
                v-for="p in pages"
                :key="p.id"
                class="col-page-item"
                @click="goDetail(p)"
              >
                <div class="col-page-title">{{ p.title }}</div>
                <div class="col-page-sub">
                  <span>点赞: {{ p.stars }} &nbsp; 评论: {{ p.comments }} &nbsp; 点评: 0</span>
                </div>
                <div class="col-page-time">发布于{{ p.publishTime }}</div>
              </div>
            </div>
          </el-scrollbar>

          <!-- 底部分页 -->
          <div v-if="selectedColId && pagesTotal > 1" class="col-pagination">
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="pageSize"
              :total="pagesTotalCount"
              layout="prev, pager, next"
              small
              @current-change="onPageChange"
            />
          </div>
        </div>
      </template>

      <!-- ====== 我的收藏夹 ====== -->
      <template v-else-if="activePanel === 'favorites'">
        <div class="col-side">
          <el-scrollbar class="col-side-scroll">
            <div
              v-for="c in catalogs"
              :key="c.id"
              class="col-catalog-item"
              :class="{ active: c.id === selectedCatalogId }"
              @click="selectCatalog(c)"
            >
              <span>{{ c.name }}</span>
              <el-tag size="small" type="info">{{ c.collectCount }}</el-tag>
            </div>
            <el-empty v-if="catalogs.length === 0" description="暂无收藏夹" :image-size="60" />
          </el-scrollbar>
        </div>

        <div class="col-main">
          <el-scrollbar v-loading="loadingFav" class="col-list-scroll">
            <div v-if="catalogPages.length === 0 && !loadingFav" class="col-empty">
              <el-empty description="收藏夹暂无文章" />
            </div>
            <div v-else class="col-page-list">
              <div
                v-for="p in catalogPages"
                :key="p.id"
                class="col-page-item"
                @click="goCatalogDetail(p)"
              >
                <div class="col-page-title">{{ p.title }}</div>
                <div class="col-page-sub">
                  <span>点赞: {{ p.stars }} &nbsp; 收藏: {{ p.collects }}</span>
                </div>
                <div class="col-page-time">收藏于{{ p.collectTime }}</div>
              </div>
            </div>
          </el-scrollbar>
        </div>
      </template>

      <!-- ====== 我的消息 ====== -->
      <template v-else>
        <div class="col-main col-main-full">
          <el-scrollbar v-loading="loadingMsg" class="col-list-scroll">
            <div v-if="messages.length === 0 && !loadingMsg" class="col-empty">
              <el-empty description="暂无更新消息" />
            </div>
            <div v-else class="col-msg-list">
              <div
                v-for="m in messages"
                :key="m.id"
                class="col-msg-item"
                :class="{ unread: !m.isRead }"
                @click="goMessage(m)"
              >
                <div class="col-msg-title">{{ m.title }}</div>
                <div class="col-msg-meta">
                  <span>{{ m.senderInfo.fullName }}</span>
                  <span class="col-dot">·</span>
                  <span>{{ m.creationTime }}</span>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowDown,
  Menu,
  Search,
  TopRight,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useProxyStore } from '@/stores/proxy'
import { getIframeBase } from '@/config'
import {
  getMyCatalogPages,
  getMyMessageList,
  getSpecialCatalog,
  getTopicSpecial,
  searchPagesByColId,
  setMessageRead,
} from '@/api/column'
import type {
  AppMessage,
  Catalog,
  CatalogPageItem,
  ColumnPageItem,
  TopicSpecial
} from '@/api/column'

const router = useRouter()
const auth = useAuthStore()
const proxy = useProxyStore()
const proxyLocal = computed(() => proxy.localEnabled)

/* --------------------------- Tab 面板 --------------------------- */
type Panel = 'browse' | 'favorites' | 'messages'
interface TabDef { key: Panel; label: string }
const tabs: TabDef[] = [
  { key: 'browse', label: '我的订阅' },
  { key: 'favorites', label: '我的收藏' },
  { key: 'messages', label: '我的消息' },
]
const activePanel = ref<Panel>('browse')

/* --------------------------- 浏览专栏 / 学科树 --------------------------- */
const topics = ref<TopicSpecial[]>([])
const topicKeyword = ref('')
const selectedColId = ref<number | null>(null)
const currentColName = ref('')
const expandedTopics = ref<Set<number>>(new Set())

// 默认展开所有学科
function initExpanded() {
  const s = new Set<number>()
  topics.value.forEach((t) => s.add(t.topicId))
  expandedTopics.value = s
}
function toggleTopic(id: number) {
  if (expandedTopics.value.has(id)) expandedTopics.value.delete(id)
  else expandedTopics.value.add(id)
  // 触发响应式
  expandedTopics.value = new Set(expandedTopics.value)
}

const filteredTopics = computed(() => {
  const kw = topicKeyword.value.trim().toLowerCase()
  if (!kw) return topics.value
  return topics.value
    .map((t) => ({
      ...t,
      cols: t.cols.filter(
        (c) => c.name.toLowerCase().includes(kw)
      )
    }))
    .filter((t) => t.cols.length > 0 || t.topicName.toLowerCase().includes(kw))
})

// 文章列表 + 分页
const pages = ref<ColumnPageItem[]>([])
const loadingPages = ref(false)
const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = 20
const pagesTotalCount = ref(0)

const pagesTotal = computed(() => Math.ceil(pagesTotalCount.value / pageSize))

async function loadPages(reset = true) {
  if (selectedColId.value === null) return
  if (reset) currentPage.value = 1
  loadingPages.value = true
  try {
    const res = await searchPagesByColId(selectedColId.value, {
      pageTitle: searchKeyword.value,
      skipCount: (currentPage.value - 1) * pageSize,
      maxResultCount: pageSize
    })
    pages.value = res.items
    pagesTotalCount.value = res.totalCount
  } catch (e: any) {
    ElMessage.error('加载文章失败：' + (e?.message || e))
  } finally {
    loadingPages.value = false
  }
}

function onPageChange() {
  loadPages(false)
}

function selectColumn(col: { id: number; name: string }, _topicName?: string) {
  selectedColId.value = col.id
  currentColName.value = col.name
  loadPages(true)
}

/* --------------------------- 收藏夹 --------------------------- */
const catalogs = ref<Catalog[]>([])
const selectedCatalogId = ref<number | null>(null)
const catalogPages = ref<CatalogPageItem[]>([])
const loadingFav = ref(false)

async function selectCatalog(c: Catalog) {
  selectedCatalogId.value = c.id
  loadingFav.value = true
  try {
    const res = await getMyCatalogPages(c.id, { maxResultCount: 50 })
    catalogPages.value = res.items
  } catch (e: any) {
    ElMessage.error('加载收藏文章失败：' + (e?.message || e))
  } finally {
    loadingFav.value = false
  }
}

/* --------------------------- 更新消息 --------------------------- */
const messages = ref<AppMessage[]>([])
const loadingMsg = ref(false)
const unreadCount = computed(() => messages.value.filter((m) => !m.isRead).length)

/* --------------------------- 导航到详情页（独立页面） --------------------------- */
function goDetail(p: ColumnPageItem) {
  router.push({ name: 'column-detail', params: { pageId: String(p.id) }, query: { colId: String(selectedColId.value) } })
}
function goCatalogDetail(p: CatalogPageItem) {
  router.push({ name: 'column-detail', params: { pageId: String(p.specialPageId) } })
}
function goMessage(m: AppMessage) {
  const pageId = m.parameter?.id
  if (!pageId) return
  // 标记消息已读（未读消息自己的已读 API）
  if (!m.isRead) {
    setMessageRead(m.id)
      .then(() => {
        m.isRead = true
      })
      .catch(() => {
        /* 静默失败 */
      })
  }
  router.push({ name: 'column-detail', params: { pageId: String(pageId) } })
}

/* --------------------------- 在新页面打开（复刻旧 iframe URL） --------------------------- */
const apiHost = computed(() => auth.apiBaseUrl || 'https://zyapi.loshop.com.cn')
const token = computed(() => auth.token || '')
const newTabUrl = computed(
  () =>
    `${getIframeBase()}/navPage.html?apiHost=${encodeURIComponent(
      apiHost.value
    )}&apiToken=${token.value}#/list?messageType=pager`
)
function openInNewTab() {
  window.open(newTabUrl.value, '_blank')
}
/** 移动端：唤起主框架的侧栏抽屉（AppLayout 监听 app:open-drawer） */
function openDrawer() {
  window.dispatchEvent(new CustomEvent('app:open-drawer'))
}

/* --------------------------- 生命周期 --------------------------- */
onMounted(async () => {
  try {
    topics.value = await getTopicSpecial()
    initExpanded()
    // 自动选中第一个专栏的第一个子项
    if (topics.value.length > 0 && topics.value[0].cols.length > 0) {
      const first = topics.value[0].cols[0]
      selectColumn(first, topics.value[0].topicName)
    }
  } catch (e: any) {
    ElMessage.error('加载专栏列表失败：' + (e?.message || e))
  }

  try {
    catalogs.value = await getSpecialCatalog()
    if (catalogs.value.length > 0) selectCatalog(catalogs.value[0])
  } catch (e: any) {
    ElMessage.error('加载收藏夹失败：' + (e?.message || e))
  }

  try {
    const res = await getMyMessageList(2, { maxResultCount: 50 })
    messages.value = res.items
  } catch (e: any) {
    ElMessage.error('加载消息失败：' + (e?.message || e))
  }
})
</script>

<style scoped>
.column-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}

/* ---------- 顶部 header ---------- */
.col-header {
  flex-shrink: 0;
  padding: 16px 24px 0;
}
.col-tabs {
  display: flex;
  gap: 28px;
  border-bottom: 2px solid #f0f0f0;
  margin-bottom: 12px;
}
.col-tab {
  position: relative;
  padding-bottom: 10px;
  font-size: 15px;
  color: #606266;
  cursor: pointer;
  user-select: none;
}
.col-tab.active {
  color: var(--el-color-primary);
  font-weight: 600;
}
.col-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2px;
  background: var(--el-color-primary);
  border-radius: 1px;
}
.col-tab-badge {
  margin-left: 4px;
}
.col-search-row {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}
.col-search-topic {
  width: 220px;
}
.col-search-article {
  width: 280px;
}
.col-header-right {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* ---------- body 左右布局 ---------- */
.col-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* 左侧栏 */
.col-side {
  width: 230px;
  flex-shrink: 0;
  border-right: 1px solid #ebeef5;
  overflow: hidden;
}
.col-side-scroll {
  height: 100%;
}
.col-topic-group {
  /* 无额外样式，由内部元素撑开 */
}
.col-topic-name {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 13px;
  color: #303133;
  cursor: pointer;
  user-select: none;
}
.col-topic-name:hover {
  background: #f5f7fa;
}
.col-topic-arrow {
  transition: transform 0.2s;
  font-size: 12px;
  color: #909399;
}
.col-topic-name.expanded .col-topic-arrow {
  transform: rotate(180deg);
}
.col-cols {
  /* 子项 */
}
.col-col-item {
  padding: 7px 14px 7px 28px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-col-item:hover {
  color: var(--el-color-primary);
  background: #ecf5ff;
}
.col-col-item.active {
  color: var(--el-color-primary);
  font-weight: 600;
  background: var(--el-color-primary-light-9);
}

/* 右侧主区 */
.col-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.col-main-full {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}
.col-list-scroll {
  flex: 1;
  min-height: 0;
}
.col-empty {
  padding: 50px 0;
}

/* 文章列表项 —— 参考原版：标题 + 点赞/评论/点评 + 发布时间 */
.col-page-list {
  padding: 6px 0;
}
.col-page-item {
  padding: 14px 24px;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
  transition: background 0.15s;
}
.col-page-item:hover {
  background: #fafbfc;
}
.col-page-title {
  font-size: 14px;
  color: #303133;
  line-height: 1.5;
}
.col-page-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
.col-page-time {
  margin-top: 4px;
  font-size: 12px;
  color: #c0c4cc;
}

/* 收藏夹 */
.col-catalog-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 13px;
}
.col-catalog-item:hover {
  background: #f5f7fa;
}
.col-catalog-item.active {
  color: var(--el-color-primary);
  font-weight: 600;
  background: var(--el-color-primary-light-9);
}

/* 消息 */
.col-msg-list {
  padding: 6px 0;
}
.col-msg-item {
  padding: 14px 24px;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
}
.col-msg-item:hover {
  background: #fafbfc;
}
.col-msg-title {
  font-size: 14px;
  color: #303133;
}
.col-msg-item.unread .col-msg-title {
  font-weight: 600;
}
.col-msg-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  display: flex;
  gap: 4px;
}
.col-dot {
  color: #dcdfe6;
}

/* 分页 */
.col-pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 12px 0 16px;
  border-top: 1px solid #f0f0f0;
}

/* 移动端专属顶栏：桌面隐藏；对齐 AppLayout 的移动端顶栏样式 */
.col-mobile-bar {
  display: none;
}

/* ===================== 移动端适配 ===================== */
@media (max-width: 767px) {
  .col-mobile-bar {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    height: 50px;
    flex-shrink: 0;
    padding: 0 8px;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #ebeef5;
  }
  .col-mobile-bar .col-mb-menu {
    font-size: 20px;
  }
  .col-mobile-bar .col-mb-title {
    flex: 1;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 8px;
  }
  .col-mobile-bar .col-mb-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* 左侧学科/专栏选择框：桌面 230px 在手机上太宽，改为自适应窄栏并允许滚动 */
  .col-side {
    width: 38vw;
    min-width: 120px;
    max-width: 160px;
    overflow-y: auto;
  }
  /* 侧栏内文字收紧，避免被挤压截断 */
  .col-topic-name {
    padding: 9px 8px;
    font-size: 12px;
  }
  .col-col-item {
    padding: 7px 8px 7px 18px;
    font-size: 12px;
  }
  /* 顶部 header 在手机上减少留白，tab 与按钮不换行 */
  .col-header {
    padding: 10px 12px 0;
  }
  .col-tabs {
    gap: 16px;
    overflow-x: auto;
    flex-wrap: nowrap;
  }
  .col-search-row {
    flex-wrap: wrap;
    gap: 8px;
  }
  .col-search-topic,
  .col-search-article {
    width: 100%;
  }
  /* 文章列表项与消息项左右间距收紧 */
  .col-page-item,
  .col-msg-item,
  .col-catalog-item {
    padding-left: 14px;
    padding-right: 14px;
  }
}
</style>

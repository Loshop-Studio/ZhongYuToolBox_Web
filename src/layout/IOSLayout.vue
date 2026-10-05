<template>
  <div class="ios-shell windows-ui">
    <main ref="scroller" class="ios-scroll-content" :class="{ 'ios-detail-page': detail }">
      <header class="ios-page-heading">
        <div class="ios-heading-leading">
          <span v-if="nativeNavigation && backAvailable" class="ios-native-back-space" aria-hidden="true"></span>
          <button v-else-if="backAvailable" class="ios-back-button" aria-label="返回上一页" @click="back"><el-icon><ArrowLeft /></el-icon></button>
          <span v-else class="ios-brand-icon"><img :src="`${baseUrl}icon.svg`" alt=""/></span>
          <h1>{{ heading }}</h1>
        </div>
        <span class="ios-school-badge">{{ auth.isLoggedIn ? auth.schoolCode.toUpperCase() : '学习工作空间' }}</span>
      </header>
      <nav v-if="sections.length && !detail" class="ios-section-nav" :aria-label="`${currentGroup.label}分类`">
        <button v-for="item in sections" :key="item.key" :class="{ active: currentSection === item.key }" :aria-current="currentSection === item.key ? 'page' : undefined" @click="section(item)">{{ item.label }}</button>
        <button v-if="activeGroup === 'resources' && currentSection === 'lesson' && auth.isLoggedIn" class="ios-course-shortcut" @click="router.push('/course')">选课 <el-icon><TopRight /></el-icon></button>
      </nav>
      <div class="ios-page-stage" :class="{ embedded: route.path === '/course', 'ios-fixed-feature': fixedFeature }">
        <router-view v-slot="{ Component, route: pageRoute }">
          <keep-alive><component :is="Component" v-if="pageRoute.meta.keepAlive" :key="String(pageRoute.name) + '|' + auth.apiBaseUrl + '|' + auth.userId" /></keep-alive>
          <component :is="Component" v-if="!pageRoute.meta.keepAlive" :key="String(pageRoute.name) + '|' + auth.apiBaseUrl + '|' + auth.userId" />
        </router-view>
      </div>
    </main>
    <MobileTabDock v-if="androidNavigation" :active="activeGroup" @select="selectGroup" @search="searchOpen = true" />
    <MobileGlassDock v-else-if="!nativeNavigation" :active="activeGroup" @select="selectGroup" @search="searchOpen = true" />
    <el-dialog v-model="searchOpen" title="查找功能" class="ios-search-dialog" width="min(520px, calc(100% - 28px))" @opened="searchInput?.focus()">
      <el-input ref="searchInput" v-model="searchQuery" placeholder="搜索笔记、错题本、选课…" clearable aria-label="搜索功能名称"><template #prefix><el-icon><Search /></el-icon></template></el-input>
      <div class="ios-search-results"><button v-for="item in searchResults" :key="item.path" :aria-label="item.label" @click="openSearchResult(item.path)"><span>{{ item.label }}</span><small>{{ item.category }}</small><el-icon><TopRight /></el-icon></button><p v-if="!searchResults.length" class="ios-search-empty">没有找到这个功能，换个关键词试试。</p></div>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import MobileGlassDock from '@/components/MobileGlassDock.vue'
import MobileTabDock from '@/components/MobileTabDock.vue'
import { PLATFORM } from '@/config'
import { mobileGroups, mobileGroupForPath, mobileSectionForPath, resourceSections, assessmentSections, personalTools, type MobileGroup } from '@/config/mobileNavigation'
import { setThemeMode } from '@/composables/useTheme'
const route = useRoute(), router = useRouter(), auth = useAuthStore()
const baseUrl = import.meta.env.BASE_URL, scroller = ref<HTMLElement>()
const nativeNavigation = (window as any).nativeHost?.kind === 'ios'
const androidNavigation = PLATFORM === 'android' || PLATFORM === 'plus'
const searchOpen = ref(false), searchQuery = ref(''), searchInput = ref<{ focus: () => void }>()
const activeGroup = computed(() => mobileGroupForPath(route.path))
const currentGroup = computed(() => mobileGroups.find(g => g.key === activeGroup.value)!)
const currentSection = computed(() => mobileSectionForPath(route.path, route.query.section))
const detail = computed(() => !!route.meta.hideLayoutHeader && !['/column', '/course'].includes(route.path) || activeGroup.value === 'me' && !['/me', '/login'].includes(route.path))
// Back navigation does not imply a bounded viewport. Personal tools and About
// use the outer scroller; only views with their own detail/workspace layout fit it.
const fixedFeature = computed(() => !!route.meta.hideLayoutHeader)
const heading = computed(() => route.path === '/login' ? '你的账号' : detail.value ? String(route.meta.title || currentGroup.value.label) : currentGroup.value.label)
const backAvailable = computed(() => detail.value || route.path === '/login' || route.path === '/course')
const sections = computed(() => activeGroup.value === 'resources' ? resourceSections : activeGroup.value === 'assessment' ? assessmentSections : [])
const remembered: Record<MobileGroup, string> = { resources: '/note', assessment: '/exam', questions: '/quora', me: '/me' }
const guestRemembered: Record<MobileGroup, string> = { resources: '/resources', assessment: '/assessment', questions: '/questions', me: '/me' }
const scrollPositions = new Map<string, number>()
const inventory = [
  ...resourceSections.map(s => ({ label: s.title, path: s.path, category: '资源', words: s.label })),
  { label: '学校选课', path: '/course', category: '资源', words: '课程' },
  ...assessmentSections.map(s => ({ label: s.title, path: s.path, category: '测评', words: s.label })),
  { label: '随身答', path: '/quora', category: '问答', words: '提问回复' },
  { label: '账号与登录', path: '/login', category: '我的', words: '用户中心退出' },
  ...personalTools.map(s => ({ label: s.label, path: s.path, category: '我的', words: s.description }))
]
const searchResults = computed(() => inventory.filter(i => !searchQuery.value.trim() || `${i.label}${i.words}${i.category}`.toLowerCase().includes(searchQuery.value.trim().toLowerCase())))
watch(() => route.fullPath, async (value, previous) => {
  if (previous && scroller.value) scrollPositions.set(previous, scroller.value.scrollTop)
  const group = mobileGroupForPath(route.path)
  if (mobileGroups.some(g => g.path === route.path)) guestRemembered[group] = route.fullPath
  if (group === 'resources' && !['/resources', '/course'].includes(route.path)) remembered.resources = '/' + route.path.split('/')[1]
  if (group === 'assessment' && route.path !== '/assessment') remembered.assessment = '/' + route.path.split('/')[1]
  ;(window as any).nativeHost?.syncNavigation?.({ path: route.path, title: heading.value, group, canGoBack: backAvailable.value })?.catch(() => {})
  await nextTick(); if (scroller.value) scroller.value.scrollTop = scrollPositions.get(value) || 0
}, { immediate: true })
watch(() => auth.userId, () => scrollPositions.clear())
function selectGroup(group: MobileGroup) {
  const path = auth.isLoggedIn && group !== 'me' ? remembered[group] : guestRemembered[group]
  router.push(path)
}
function section(item: { key: string; path: string }) {
  if (auth.isLoggedIn) router.push(item.path)
  else router.replace({ path: activeGroup.value === 'resources' ? '/resources' : '/assessment', query: { section: item.key } })
}
function back() { if (router.options.history.state.back) router.back(); else router.replace(currentGroup.value.path) }
function openSearchResult(path: string) { searchOpen.value = false; router.push(path) }
;(window as any).__zytbNavigate = (path: string) => router.push(path)
;(window as any).__zytbSelectGroup = selectGroup
;(window as any).__zytbSetThemeMode = setThemeMode
;(window as any).__zytbBack = () => {
  if (searchOpen.value) { searchOpen.value = false; return true }
  const close = Array.from(document.querySelectorAll<HTMLElement>('.el-overlay-dialog .el-dialog__headerbtn, .el-message-box__headerbtn')).find(button => button.getClientRects().length > 0 && getComputedStyle(button).visibility !== 'hidden')
  if (close) { close.click(); return true }
  if (mobileGroups.some(g => g.path === route.path) || ['/note', '/exam', '/quora'].includes(route.path)) return false
  back(); return true
}
function openTools() { searchOpen.value = true }
onMounted(() => { if (auth.isLoggedIn) auth.startRefresh(); window.addEventListener('app:open-drawer', openTools) })
onBeforeUnmount(() => { window.removeEventListener('app:open-drawer', openTools) })
</script>

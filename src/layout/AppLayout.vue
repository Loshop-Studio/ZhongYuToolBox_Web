<template>
  <div class="layout-root" :class="{ 'windows-ui': showEditionUI, 'is-plain': isLoshopPlain }">
    <!-- 背景封面氛围 -->
    <div class="bg-cover" :style="{ backgroundImage: `url(${bgUrl})` }"></div>

    <!-- ===== 移动端顶栏（置顶，二级页面隐藏） ===== -->
    <header v-if="isMobile && !hideHeader" class="mobile-topbar">
      <el-button text :icon="Menu" class="menu-btn" @click="drawer = true" />
      <span class="mb-title">{{ currentTitle }}</span>
      <div class="mb-right">
        <el-tag v-if="proxyLocal" type="success" size="small" effect="dark">加速</el-tag>
        <el-button text :icon="User" @click="goLogin" />
        <el-dropdown trigger="click" @command="onMobileCommand">
          <el-button text :icon="More" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :icon="User" command="user">个人中心</el-dropdown-item>
              <el-dropdown-item divided disabled>主题</el-dropdown-item>
              <el-dropdown-item
                v-for="t in THEME_OPTIONS"
                :key="t.value"
                :command="t.value"
              >
                <el-icon :style="{ visibility: currentTheme === t.value ? 'visible' : 'hidden' }"><Check /></el-icon>
                <span>{{ t.label }}</span>
              </el-dropdown-item>
              <el-dropdown-item divided :icon="SwitchButton" command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <el-container class="main-container" :class="{ 'is-mobile': isMobile }">
      <!-- 侧边栏（桌面端常驻） -->
      <el-aside v-if="!isMobile" :width="collapsed ? '72px' : '220px'" class="aside" :class="{ 'is-collapsed': collapsed, 'instant-collapse': instantCollapse }">
        <div class="brand">
          <img v-if="showEditionUI" :src="`${baseUrl}icon.png`" class="edition-app-icon" alt="中育Toolbox" />
          <img v-else :src="`${baseUrl}icon.png`" class="brand-icon" alt="中育ToolBox" />
          <div v-if="showEditionUI" class="edition-brand-text" :aria-hidden="collapsed"><strong>中育Toolbox</strong><small>学习工作空间</small></div>
        </div>
        <SideMenu :collapse="collapsed" :light="showEditionUI" :plain="isLoshopPlain" />
        <div v-if="showEditionUI" class="edition-sidebar-footer" :aria-hidden="collapsed">作者 {{ EDITION.originalAuthor }}</div>
      </el-aside>

      <!-- 主区域 -->
      <el-container>
        <!-- 桌面端顶栏（二级页面隐藏） -->
        <el-header v-if="!isMobile && !hideHeader" class="header">
          <el-button text class="collapse-btn" aria-label="展开或收起侧栏" :aria-expanded="!collapsed" @click="toggleSidebar"><el-icon>
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon></el-button>
          <span class="header-title">中育Toolbox</span>
          <div class="header-right">
            <el-select v-if="isWindowsEdition" v-model="currentTheme" aria-label="主题" class="theme-select" @change="setTheme">
              <el-option label="Loshop 亮色" value="loshop-light" />
              <el-option label="Loshop 深色" value="loshop-dark" />
              <el-option label="aoki 亮色" value="aoki-light" />
              <el-option label="aoki 深色" value="aoki-dark" />
              <el-option label="Aero 亮色" value="aero-light" />
              <el-option label="Aero 深色" value="aero-dark" />
              <el-option label="Glass 亮色" value="glass-light" />
              <el-option label="Glass 深色" value="glass-dark" />
            </el-select>
            <el-tag v-if="proxyLocal" type="success" size="small" effect="dark">本地加速已启用</el-tag>
            <el-button text :icon="User" @click="goLogin">
              {{ auth.isLoggedIn ? auth.userName : '未登录' }}
            </el-button>
          </div>
        </el-header>

        <el-main class="content" :class="{ flush: hideHeader }" ref="mainRef">
          <div v-if="showEditionUI && !hideHeader" class="edition-page-heading">
            <div><div class="edition-breadcrumb">工作空间 <span>/</span> {{ currentTitle }}</div><h1>{{ currentTitle }}</h1><p>{{ currentDescription }}</p></div>
            <el-tag :type="auth.isLoggedIn ? 'success' : 'info'" round effect="plain">{{ auth.isLoggedIn ? '账号已登录' : '账号未登录' }}</el-tag>
          </div>
          <router-view v-slot="{ Component, route }">
            <transition name="fade" mode="out-in">
              <keep-alive v-if="route.meta.keepAlive">
                <component :is="Component" :key="String(route.name) + '|' + auth.apiBaseUrl + '|' + auth.userId" />
              </keep-alive>
              <component :is="Component" v-else :key="String(route.name) + '|' + auth.apiBaseUrl + '|' + auth.userId" />
            </transition>
          </router-view>
          <footer v-if="showEditionUI && !hideHeader" class="edition-footer"><span>作者 {{ EDITION.originalAuthor }}</span><el-button text @click="router.push('/about')">关于应用</el-button></footer>
        </el-main>
      </el-container>
    </el-container>

    <!-- 移动端侧边抽屉 -->
    <el-drawer
      v-model="drawer"
      title="中育ToolBox"
      direction="ltr"
      size="72%"
      class="mobile-drawer"
    >
      <SideMenu :collapse="false" @select="drawer = false" />
    </el-drawer>

    <!-- 返回顶部 -->
    <transition name="fade">
      <el-button
        v-show="showBackTop && !isMobile"
        class="back-top"
        circle
        :icon="CaretTop"
        @click="scrollToTop"
      />
    </transition>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Menu,
  Fold,
  Expand,
  CaretTop,
  User,
  More,
  SwitchButton,
  Check
} from '@element-plus/icons-vue'
import SideMenu from './SideMenu.vue'
import { useAuthStore } from '@/stores/auth'
import { useProxyStore } from '@/stores/proxy'
import { startProxyPolling, stopProxyPolling, getProxyBaseUrl } from '@/utils/proxy'
import { useIsMobile } from '@/composables/useIsMobile'
import { checkVersion } from '@/utils/track'
import { PLATFORM, IS_WINDOWS } from '@/config'
import { EDITION } from '@/config/edition'
import { currentTheme, currentSkin, setTheme, THEME_OPTIONS, type ThemeId } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const proxy = useProxyStore()
const { isMobile } = useIsMobile()
const isWindowsEdition = IS_WINDOWS
// 主题切换：仅 aoki/Aero 启用自定义外壳；Loshop 退回纯 Element Plus 默认布局。
const showEditionUI = computed(() => isWindowsEdition && currentSkin.value !== 'loshop')
const isLoshopPlain = computed(() => isWindowsEdition && currentSkin.value === 'loshop')
const baseUrl = import.meta.env.BASE_URL
const descriptions: Record<string, string> = {
  '/login': '管理账号，快速进入你的学习资源。', '/note': '浏览笔记与文件夹，将 PDF 整理到云端。',
  '/exam': '查看测评任务、题目与分析。', '/donate': '支持作者，帮助工具箱持续维护。',
  '/about': '使用说明、项目致谢与本版本的贡献者。',
  '/apps': '从学校官方更新服务下载中育学生应用。'
}
const currentDescription = computed(() => descriptions[route.path] || '在一个工作空间中管理你的学习资源。')

const collapsed = ref(false)
const instantCollapse = ref(false)
function toggleSidebar(event: MouseEvent) {
  instantCollapse.value = event.detail === 0
  collapsed.value = !collapsed.value
}
const drawer = ref(false)
const bgUrl = ref(`${import.meta.env.BASE_URL}bg3.jpg`)

const currentTitle = computed(() => (route.meta.title as string) || '中育ToolBox')
/** 二级页面（如笔记预览）隐藏布局顶栏，由页面自身的顶栏接管 */
const hideHeader = computed(() => !!route.meta.hideLayoutHeader)
const proxyLocal = computed(() => proxy.localEnabled)

const mainRef = ref()
const showBackTop = ref(false)

function onScroll() {
  const el = document.querySelector('.content')
  const top = el ? el.scrollTop : window.scrollY
  showBackTop.value = top > 300
}
function scrollToTop() {
  const el = document.querySelector('.content')
  if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
  else window.scrollTo({ top: 0, behavior: 'smooth' })
}
function goLogin() {
  router.push('/login')
}
function onMobileCommand(cmd: string) {
  if (cmd === 'user') {
    router.push('/login')
  } else if (cmd === 'logout') {
    auth.logout()
    router.push('/login')
  } else if (THEME_OPTIONS.some(o => o.value === cmd)) {
    setTheme(cmd as ThemeId)
  }
}

function onProxyStatusChange(localOk: boolean, isWindows: boolean) {
  proxy.setStatus(localOk, getProxyBaseUrl())
  if (localOk) {
    ElMessage.success('本地加速服务已启用')
  } else if (isWindows) {
    ElMessage.warning('未检测到加速插件，建议下载 tbHelper 以提升加载速度')
  }
}

// 更新分发：启动即检测一次，并每 10 分钟复检（仅 electron / webview2 / uniapp 实际生效）
let versionTimer: number | null = null

onMounted(() => {
  startProxyPolling(onProxyStatusChange)
  const content = document.querySelector('.content')
  content?.addEventListener('scroll', onScroll)
  // 让接管顶栏的二级页面（如在线专栏）也能唤起移动端侧栏抽屉
  window.addEventListener('app:open-drawer', onOpenDrawer)
  // 更新分发检测
  checkVersion()
  versionTimer = window.setInterval(checkVersion, 10 * 60 * 1000)
})
onUnmounted(() => {
  stopProxyPolling()
  const content = document.querySelector('.content')
  content?.removeEventListener('scroll', onScroll)
  window.removeEventListener('app:open-drawer', onOpenDrawer)
  if (versionTimer !== null) {
    clearInterval(versionTimer)
    versionTimer = null
  }
})

function onOpenDrawer() {
  drawer.value = true
}
</script>

<style scoped>
.layout-root {
  height: 100vh;
  overflow: hidden;
  position: relative;
}
.bg-cover {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: brightness(0.6);
  z-index: 0;
  pointer-events: none;
}
.main-container {
  position: relative;
  z-index: 1;
  height: 100%;
}
.aside {
  background: #1f2937;
  transition: width 0.25s ease;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  position: relative;
  z-index: 2;
  scrollbar-width: none; /* Firefox 隐藏滚动条 */
}
/* Loshop（纯 EP 默认）：去掉自定义深色侧栏背景 */
.layout-root.is-plain .aside {
  background: transparent;
}
.aside::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Edge 隐藏滚动条 */
}
.aside {
  -ms-overflow-style: none; /* IE/旧 Edge 隐藏滚动条 */
}
.brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 0;
}
.brand-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
.header {
  background: var(--el-bg-color, #ffffff);
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-light, #ebeef5);
  padding: 0 16px;
}
.collapse-btn {
  font-size: 20px;
  cursor: pointer;
  margin-right: 12px;
  color: #303133;
}
.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.content {
  background: var(--el-bg-color-page, #f2f3f5);
  overflow-y: auto;
  padding: 20px;
  position: relative;
}
/* 二级页面（顶栏接管）去除内容区内边距，让顶栏贴顶贴边 */
.content.flush {
  padding: 0;
}
/* 移动端非二级页面收紧左右内边距，避免列表等页面两侧空隙过大 */
@media (max-width: 767px) {
  .content:not(.flush) {
    padding: 8px;
  }
}
.back-top {
  position: fixed;
  right: 32px;
  bottom: 32px;
  z-index: 2000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ===== 移动端顶栏（置顶） ===== */
.mobile-topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #ebeef5;
}
.mobile-topbar .menu-btn {
  font-size: 20px;
}
.mobile-topbar .mb-title {
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
.mobile-topbar .mb-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
/* 移动端主容器占满高度 */
.main-container.is-mobile {
  height: calc(100% - 50px);
}
/* 移动端抽屉宽度：按比例并限制最大宽度，避免在大屏手机上过宽 */
.mobile-drawer.el-drawer {
  max-width: 320px;
}
</style>

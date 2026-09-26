<template>
  <div class="layout-root">
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
              <el-dropdown-item :icon="SwitchButton" command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <el-container class="main-container" :class="{ 'is-mobile': isMobile }">
      <!-- 侧边栏（桌面端常驻） -->
      <el-aside v-if="!isMobile" :width="collapsed ? '64px' : '220px'" class="aside">
        <div class="brand">
          <img src="/icon.png" class="brand-icon" alt="中育ToolBox" />
        </div>
        <SideMenu :collapse="collapsed" />
      </el-aside>

      <!-- 主区域 -->
      <el-container>
        <!-- 桌面端顶栏（二级页面隐藏） -->
        <el-header v-if="!isMobile && !hideHeader" class="header">
          <el-icon class="collapse-btn" @click="collapsed = !collapsed">
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
          <span class="header-title">{{ currentTitle }}</span>
          <div class="header-right">
            <el-tag v-if="proxyLocal" type="success" size="small" effect="dark">本地加速已启用</el-tag>
            <el-button text :icon="User" @click="goLogin">
              {{ auth.isLoggedIn ? auth.userName : '未登录' }}
            </el-button>
          </div>
        </el-header>

        <el-main class="content" :class="{ flush: hideHeader }" ref="mainRef">
          <router-view v-slot="{ Component, route }">
            <transition name="fade" mode="out-in">
              <keep-alive v-if="route.meta.keepAlive">
                <component :is="Component" />
              </keep-alive>
              <component :is="Component" v-else />
            </transition>
          </router-view>
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

    <!-- 全局阻断弹窗（版本强制更新 / 风控封禁），覆盖全屏阻止继续使用 -->
    <ForceBlock />
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
  SwitchButton
} from '@element-plus/icons-vue'
import SideMenu from './SideMenu.vue'
import ForceBlock from '@/components/ForceBlock.vue'
import { useAuthStore } from '@/stores/auth'
import { useProxyStore } from '@/stores/proxy'
import { startProxyPolling, stopProxyPolling, getProxyBaseUrl } from '@/utils/proxy'
import { checkVersion } from '@/utils/track'
import { useIsMobile } from '@/composables/useIsMobile'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const proxy = useProxyStore()
const { isMobile } = useIsMobile()

const collapsed = ref(false)
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

// 更新分发：启动即检测一次，并每 10 分钟复检（仅 electron / uniapp 实际生效）
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
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  border-bottom: 1px solid #ebeef5;
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
  background: rgba(245, 247, 250, 0.82);
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

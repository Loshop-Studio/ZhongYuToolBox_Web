<template>
  <div class="ios-me-page">
    <button class="ios-account-card" aria-label="账号与登录" @click="router.push('/login')">
      <div class="ios-avatar"><img v-if="auth.isLoggedIn" :src="auth.photo" alt=""/><el-icon v-else><UserFilled /></el-icon></div>
      <div><h2>{{ auth.isLoggedIn ? auth.userName : '登录中育账号' }}</h2><p>{{ auth.isLoggedIn ? '查看账号与登录状态' : '让笔记、作业和问答在这里相遇' }}</p></div><el-icon><ArrowRight /></el-icon>
    </button>
    <section class="ios-settings-section"><h3>外观</h3><div class="ios-theme-picker" role="group" aria-label="外观模式"><button v-for="item in modes" :key="item.mode" :aria-label="item.label" :aria-pressed="themeMode === item.mode" :class="{ active: themeMode === item.mode }" @click="setThemeMode(item.mode)"><el-icon><component :is="item.icon" /></el-icon>{{ item.label }}</button></div></section>
    <section v-for="section in ['工具', '项目']" :key="section" class="ios-settings-section"><h3>{{ section }}</h3><div class="ios-setting-list"><button v-for="item in personalTools.filter(t => t.section === section)" :key="item.path" :aria-label="item.label" @click="router.push(item.path)"><span class="ios-setting-icon"><el-icon><component :is="item.icon" /></el-icon></span><span class="ios-setting-copy"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span><el-icon class="ios-chevron"><ArrowRight /></el-icon></button></div></section>
    <footer class="ios-me-footer">中育工具箱 {{ APP_VERSION }}<br>原作者 Loshop · Co-author aoki</footer>
  </div>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { personalTools } from '@/config/mobileNavigation'
import { APP_VERSION } from '@/config'
import { themeMode, setThemeMode, type ThemeMode } from '@/composables/useMobileTheme'
const router = useRouter(), auth = useAuthStore()
const modes: { mode: ThemeMode; label: string; icon: string }[] = [{ mode: 'light', label: '浅色', icon: 'Sunny' }, { mode: 'dark', label: '深色', icon: 'Moon' }, { mode: 'system', label: '跟随系统', icon: 'Monitor' }]
</script>

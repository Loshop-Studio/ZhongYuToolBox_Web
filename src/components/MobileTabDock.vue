<template>
  <nav class="mobile-tab-dock" aria-label="主导航">
    <button v-for="group in mobileGroups" :key="group.key" :class="{ active: active === group.key }" :aria-current="active === group.key ? 'page' : undefined" @click="$emit('select', group.key)"><span class="mobile-tab-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="group.icon"/></svg></span><span>{{ group.label }}</span></button>
    <button class="mobile-tab-search" aria-label="查找功能" @click="$emit('search')"><el-icon><Search /></el-icon><span>搜索</span></button>
  </nav>
</template>
<script setup lang="ts">
import { mobileGroups, type MobileGroup } from '@/config/mobileNavigation'
defineProps<{ active: MobileGroup }>()
defineEmits<{ select: [group: MobileGroup]; search: [] }>()
</script>
<style scoped>
.mobile-tab-dock { position:fixed; z-index:1900; bottom:0; left:0; right:0; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); background:var(--surface); border-top:1px solid var(--line); padding:6px max(6px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(6px,env(safe-area-inset-left)); }
.mobile-tab-dock button { border:0; background:transparent; color:var(--muted); display:flex; flex-direction:column; justify-content:center; align-items:center; gap:5px; min-height:56px; font-size:12px; padding:0; }
.mobile-tab-icon { width:48px; height:30px; display:grid; place-items:center; border-radius:16px; transition:background 160ms ease; }
.mobile-tab-icon svg { width:23px; height:23px; fill:currentColor; }
.mobile-tab-dock button.active { color:var(--accent); }
.mobile-tab-dock button.active .mobile-tab-icon { background:var(--accent-soft); }
.mobile-tab-search .el-icon { height:30px; font-size:24px; }
.mobile-tab-dock button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
@media(prefers-reduced-motion:reduce) { .mobile-tab-icon { transition:none; } }
</style>

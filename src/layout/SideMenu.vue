<template>
  <el-menu
    :default-active="activeIndex"
    class="side-menu"
    :collapse="collapse"
    :collapse-transition="false"
    @select="onSelect"
    :background-color="plain ? undefined : (light ? 'var(--surface)' : '#1f2937')"
    :text-color="plain ? undefined : (light ? 'var(--muted)' : '#cbd5e1')"
    :active-text-color="plain ? undefined : (light ? 'var(--accent)' : '#ffffff')"
  >
    <el-menu-item v-for="item in items" :key="item.index" :index="item.index" :aria-label="item.title" :class="{ 'is-support': item.index === '/donate', 'is-section-start': light && item.index === '/donate' }" @click="onClick(item.index)">
      <el-icon><component :is="item.icon" /></el-icon>
      <template #title>{{ item.title }}</template>
    </el-menu-item>
  </el-menu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MENU_ITEMS } from './menuItems'

const props = defineProps<{ collapse: boolean; light?: boolean; plain?: boolean }>()
const emit = defineEmits<{ (e: 'select'): void }>()
const router = useRouter()
const route = useRoute()

const items = computed(() => props.light
  ? [...MENU_ITEMS.filter(item => item.index !== '/donate' && item.index !== '/about'),
    ...MENU_ITEMS.filter(item => ['/donate', '/about'].includes(item.index))]
  : MENU_ITEMS)
const activeIndex = computed(() => route.path)

function onSelect(index: string) {
  router.push(index)
  emit('select')
}

function onClick(index: string) {
  if (route.path !== index) {
    router.push(index)
  }
  emit('select')
}
void props
</script>

<style scoped>
.side-menu {
  border-right: none;
  height: 100%;
  width: 100%;
  scrollbar-width: none;
}
.side-menu::-webkit-scrollbar {
  display: none;
}
.side-menu {
  -ms-overflow-style: none;
}
</style>

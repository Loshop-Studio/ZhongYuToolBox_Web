<template>
  <div v-show="!keyboardOpen" class="ios-dock-wrap">
    <nav ref="pill" class="ios-glass-dock" aria-label="主导航" :class="{ dragging: tracking }"
      @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="cancel">
      <div class="ios-glass-lens" :style="{ transform: `translateX(${position * 100}%)` }" aria-hidden="true"></div>
      <button v-for="(item, index) in mobileGroups" :key="item.key" type="button"
        :aria-label="item.label" :aria-current="active === item.key ? 'page' : undefined"
        :class="{ selected: Math.round(position) === index }" @click="click($event, index)" @keydown="key($event, index)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" fill-rule="evenodd" /></svg>
        <span>{{ item.label }}</span>
      </button>
    </nav>
    <button class="ios-glass-search" type="button" aria-label="搜索功能" @click="$emit('search')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
    </button>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { mobileGroups, type MobileGroup } from '@/config/mobileNavigation'
const props = defineProps<{ active: MobileGroup }>()
const emit = defineEmits<{ select: [group: MobileGroup]; search: [] }>()
const pill = ref<HTMLElement>(), tracking = ref(false), position = ref(0), keyboardOpen = ref(false)
const activeIndex = computed(() => mobileGroups.findIndex(g => g.key === props.active))
let pointerID = -1, suppressClickUntil = 0
watch(activeIndex, value => { if (!tracking.value) position.value = value }, { immediate: true })
function at(event: PointerEvent) {
  const box = pill.value!.getBoundingClientRect()
  return Math.min(3, Math.max(0, (event.clientX - box.left - 6) / ((box.width - 12) / 4) - .5))
}
function start(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0) return
  pointerID = event.pointerId; tracking.value = true
  pill.value?.setPointerCapture(pointerID); position.value = at(event)
}
function move(event: PointerEvent) { if (tracking.value && event.pointerId === pointerID) position.value = at(event) }
function end(event: PointerEvent) {
  if (!tracking.value || event.pointerId !== pointerID) return
  const box = pill.value!.getBoundingClientRect()
  if (event.clientY < box.top - 24 || event.clientY > box.bottom + 24) { cancel(); return }
  const index = Math.round(at(event)); tracking.value = false; suppressClickUntil = performance.now() + 350
  position.value = index; emit('select', mobileGroups[index].key)
}
function cancel() { tracking.value = false; position.value = activeIndex.value; suppressClickUntil = performance.now() + 350 }
function click(event: MouseEvent, index: number) { if (event.detail === 0 || performance.now() > suppressClickUntil) emit('select', mobileGroups[index].key) }
function key(event: KeyboardEvent, index: number) {
  const next = event.key === 'ArrowRight' ? (index + 1) % 4 : event.key === 'ArrowLeft' ? (index + 3) % 4 : event.key === 'Home' ? 0 : event.key === 'End' ? 3 : -1
  if (next < 0) return
  event.preventDefault(); (pill.value?.querySelectorAll('button')[next] as HTMLButtonElement)?.focus(); emit('select', mobileGroups[next].key)
}
function viewport() {
  const focused = document.activeElement?.matches('input, textarea, [contenteditable="true"]')
  keyboardOpen.value = !!focused && !!window.visualViewport && window.visualViewport.height < window.innerHeight * .78
}
onMounted(() => { window.visualViewport?.addEventListener('resize', viewport); window.addEventListener('focusout', viewport) })
onBeforeUnmount(() => { window.visualViewport?.removeEventListener('resize', viewport); window.removeEventListener('focusout', viewport) })
</script>

<template>
  <MobileLayout v-if="IS_MOBILE" />
  <AppLayout v-else />
  <ForceBlock />
</template>

<script setup lang="ts">
import AppLayout from './layout/AppLayout.vue'
import MobileLayout from './layout/IOSLayout.vue'
import { IS_MOBILE } from './config'
import ForceBlock from './components/ForceBlock.vue'
</script>

<template>
  <IOSLayout v-if="PLATFORM === 'ios'" />
  <AppLayout v-else />
  <ForceBlock />
</template>

<script setup lang="ts">
import AppLayout from './layout/AppLayout.vue'
import ForceBlock from './components/ForceBlock.vue'
import IOSLayout from './layout/IOSLayout.vue'
import { PLATFORM } from './config'
</script>

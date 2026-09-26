<template>
  <div v-if="blockState.active" class="force-block-mask">
    <div class="force-block-card">
      <el-icon class="fb-icon" :class="blockState.kind"><WarningFilled v-if="blockState.kind === 'ban'" /><Download v-else /></el-icon>
      <h2 class="fb-title">{{ blockState.title }}</h2>
      <p class="fb-msg">{{ blockState.message }}</p>
      <el-button v-if="blockState.kind === 'version'" type="primary" @click="onRefresh">刷新页面</el-button>
      <el-button v-else type="danger" @click="onLogout">退出登录</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, onMounted } from 'vue'
import { WarningFilled, Download } from '@element-plus/icons-vue'
import { blockState, clearBlock } from '@/stores/block'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

function onRefresh() {
  location.reload()
}
function onLogout() {
  clearBlock()
  auth.logout()
  router.push('/login')
}

// 封禁弹窗出现后使当前会话失效（避免继续使用），但保留封禁界面持续展示
function doAutoLogout() {
  if (blockState.active && blockState.kind === 'ban') {
    auth.logout()
    router.push('/login')
  }
}

onMounted(doAutoLogout)
watch(
  () => [blockState.active, blockState.kind],
  ([active, kind]) => {
    if (active && kind === 'ban') doAutoLogout()
  }
)
</script>

<style scoped>
.force-block-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.force-block-card {
  width: 100%;
  max-width: 420px;
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
.fb-icon {
  font-size: 48px;
  color: var(--el-color-warning);
  margin-bottom: 8px;
}
.fb-icon.ban {
  color: var(--el-color-danger);
}
.fb-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--el-text-color-primary);
}
.fb-msg {
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  margin: 0 0 20px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

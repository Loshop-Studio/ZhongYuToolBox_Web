<template>
  <section class="feedback-panel" aria-label="问题反馈">
    <h2>问题反馈</h2>
    <p class="muted">描述你做了什么、预期结果、实际报错，并附上截图。截图中请遮住账号、姓名及个人学习资料。</p>
    <div class="channels">
      <a :href="issueUrl" target="_blank" rel="noopener noreferrer">在 GitHub 提交问题 ↗</a>
      <template v-if="QQ_FEEDBACK_GROUP">
        <p>QQ 交流群：<strong>{{ QQ_FEEDBACK_GROUP }}</strong></p>
        <el-button @click="copyGroup">复制群号</el-button>
      </template>
    </div>
    <h3>反馈信息</h3><p class="muted">以下内容只在本机生成，不包含账号、密码、Token 或笔记。复制后可发到交流群，也可编辑 GitHub 的反馈内容。</p>
    <el-input v-model="text" type="textarea" :rows="10" aria-label="反馈内容" />
    <el-button class="copy-feedback" @click="copyFeedback">复制反馈信息</el-button>
  </section>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { APP_VERSION, PLATFORM } from '@/config'
import { RELEASE_REPOSITORY, QQ_FEEDBACK_GROUP } from '@/config/edition'
const text = ref(`版本：${APP_VERSION}\n平台：${PLATFORM}${PLATFORM === 'ios' ? '（Beta 内测）' : ''}\n视窗：${window.innerWidth} × ${window.innerHeight}\n系统 / 浏览器：${navigator.userAgent}\n\n操作步骤：\n1. \n\n预期结果：\n\n实际结果 / 报错：\n\n截图：`)
const issueUrl = computed(() => `https://github.com/${RELEASE_REPOSITORY}/issues/new?title=${encodeURIComponent(`[${PLATFORM}] 问题反馈`)}&body=${encodeURIComponent(text.value)}`)
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); ElMessage.success('已复制') }
  catch { ElMessage.warning('系统未允许访问剪贴板，请长按反馈内容手动复制') }
}
const copyFeedback = () => copy(text.value)
const copyGroup = () => copy(QQ_FEEDBACK_GROUP)
</script>
<style scoped>
.feedback-panel { overflow-wrap:anywhere; }.muted { color:var(--el-text-color-secondary); line-height:1.7; }.channels { display:flex; align-items:center; flex-wrap:wrap; gap:16px; }.copy-feedback { margin-top:16px; }
</style>

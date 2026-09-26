<template>
  <div class="advance-page">
    <el-alert type="warning" :closable="false" show-icon class="mb">
      修改以下配置将写入浏览器本地存储（localStorage），仅影响本机。若不确定，请勿修改；点击「恢复默认」可清除自定义值。
    </el-alert>

    <el-card class="block" header="服务器地址">
      <el-form label-position="top">
        <el-form-item label="API 基地址 (apiBaseUrl)">
          <el-input v-model="apiBaseUrl" placeholder="https://zyapi.loshop.com.cn" />
        </el-form-item>
        <el-form-item label="分享服务地址 (shareServer)">
          <el-input v-model="shareServer" placeholder="https://zytbshareapi.loshop.com.cn" />
        </el-form-item>
        <el-form-item label="嵌套 iframe 基地址 (iframeBase)">
          <el-input v-model="iframeBase" placeholder="https://zyapi.loshop.com.cn" />
        </el-form-item>
        <div class="actions">
          <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
          <el-button :loading="resetting" @click="resetDefault">恢复默认</el-button>
        </div>
      </el-form>
    </el-card>

    <el-card class="block" header="资源代理状态">
      <div class="proxy-row">
        <span class="muted">当前生效代理：</span>
        <code>{{ proxyBase }}</code>
        <el-tag :type="proxyIsLocal ? 'success' : 'info'" size="small">
          {{ proxyIsLocal ? '本地加速' : '远端代理' }}
        </el-tag>
      </div>
      <div class="proxy-row">
        <el-button size="small" :icon="Refresh" :loading="detecting" @click="detect">重新探测本地加速插件</el-button>
      </div>
    </el-card>

    <el-card class="block" header="登录凭证">
      <div class="kv"><span class="muted">用户名</span><span>{{ auth.userName || '未登录' }}</span></div>
      <div class="kv"><span class="muted">真实姓名</span><span>{{ auth.realName || '-' }}</span></div>
      <div class="kv"><span class="muted">Token 过期</span><span>{{ tokenExpireText }}</span></div>
      <div class="actions">
        <el-button type="danger" plain :icon="Delete" @click="clearToken">清除本地 Token</el-button>
      </div>
      <div class="muted tip">清除后需重新登录。此操作只删除本地凭证，不影响账号。</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Delete } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { getProxyBaseUrl, detectLocalProxy } from '@/utils/proxy'
import { API_BASE_URL, SHARE_SERVER, getIframeBase, PROXY_LOCAL, PROXY_REMOTE } from '@/config'

const auth = useAuthStore()

const apiBaseUrl = ref(API_BASE_URL)
const shareServer = ref(SHARE_SERVER)
const iframeBase = ref(getIframeBase())

const proxyBase = ref(getProxyBaseUrl())
const proxyIsLocal = ref(proxyBase.value === PROXY_LOCAL)
const detecting = ref(false)

const saving = ref(false)
const resetting = ref(false)

const tokenExpireText = ref('')

function syncFromStorage() {
  apiBaseUrl.value = localStorage.getItem('apiBaseUrl') || API_BASE_URL
  shareServer.value = localStorage.getItem('shareServer') || SHARE_SERVER
  iframeBase.value = getIframeBase()
  const exp = localStorage.getItem('tokenExpire')
  if (exp) {
    const d = new Date(Number(exp))
    tokenExpireText.value = isNaN(d.getTime()) ? exp : d.toLocaleString()
  } else {
    tokenExpireText.value = '未知'
  }
  proxyBase.value = getProxyBaseUrl()
  proxyIsLocal.value = proxyBase.value === PROXY_LOCAL
}

function save() {
  saving.value = true
  try {
    localStorage.setItem('apiBaseUrl', apiBaseUrl.value.trim())
    localStorage.setItem('shareServer', shareServer.value.trim())
    localStorage.setItem('iframeBase', iframeBase.value.trim())
    ElMessage.success('配置已保存，刷新页面后生效')
  } finally {
    saving.value = false
  }
}

async function resetDefault() {
  resetting.value = true
  try {
    localStorage.removeItem('apiBaseUrl')
    localStorage.removeItem('shareServer')
    localStorage.removeItem('iframeBase')
    syncFromStorage()
    ElMessage.success('已恢复默认地址')
  } finally {
    resetting.value = false
  }
}

async function detect() {
  detecting.value = true
  try {
    await detectLocalProxy()
    proxyBase.value = getProxyBaseUrl()
    proxyIsLocal.value = proxyBase.value === PROXY_LOCAL
  } finally {
    detecting.value = false
  }
}

async function clearToken() {
  try {
    await ElMessageBox.confirm('确认清除本地 Token？清除后需重新登录。', '清除凭证', { type: 'warning' })
  } catch {
    return
  }
  localStorage.setItem('token', '')
  localStorage.setItem('refreshToken', '')
  localStorage.setItem('tokenExpire', '')
  localStorage.setItem('refreshTokenExpire', '')
  ElMessage.success('已清除，请重新登录')
  auth.logout?.()
}

onMounted(syncFromStorage)
</script>

<style scoped>
.advance-page {
  max-width: 880px;
  margin: 0 auto;
}
.mb {
  margin-bottom: 16px;
}
.block {
  margin-bottom: 16px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.proxy-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.proxy-row code {
  background: var(--el-fill-color-light);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  word-break: break-all;
}
.kv {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 14px;
}
.tip {
  font-size: 12px;
  margin-top: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
}
@media (max-width: 767px) {
  .advance-page {
    padding: 0 4px;
  }
}
</style>

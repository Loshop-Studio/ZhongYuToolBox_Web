<template>
  <div class="proxy-page">
    <el-card v-if="!IS_BROWSER" class="block" header="本机网络桥">
      <p>本客户端通过原生网络桥读取中育接口、图片和文件，无需额外安装下载加速插件。</p>
      <p class="muted">遇到加载失败时，请检查学校服务地址、登录状态与网络连接。</p>
    </el-card>
    <el-card v-else class="block" header="加速状态">
      <div class="proxy-row">
        <span class="muted">当前生效代理：</span>
        <code>{{ proxyBase }}</code>
        <el-tag :type="proxyIsLocal ? 'success' : 'info'" size="small">
          {{ proxyIsLocal ? '本地加速已启用' : '远端代理' }}
        </el-tag>
      </div>
      <el-button :icon="Refresh" :loading="detecting" @click="detect">重新探测</el-button>
    </el-card>

    <el-card v-if="IS_BROWSER" class="block" header="下载加速插件">
      <p class="muted">网页预览需要本机资源代理；旧版安装程序未随本客户端打包。可到原作者的下载页查看插件与使用说明。</p>
      <div class="dl-row">
        <el-button type="primary" :icon="Download" @click="open(pluginUrl)">打开原作者下载页</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Refresh, Download } from '@element-plus/icons-vue'
import { getProxyBaseUrl, detectLocalProxy } from '@/utils/proxy'
import { PROXY_LOCAL, IS_BROWSER } from '@/config'

const pluginUrl = 'https://wumama.lanzouw.com/iG92334tbeeb'

const proxyBase = ref(getProxyBaseUrl())
const proxyIsLocal = ref(proxyBase.value === PROXY_LOCAL)
const detecting = ref(false)

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

function open(url: string) {
  window.open(url, '_blank')
}

onMounted(() => {
  proxyBase.value = getProxyBaseUrl()
  proxyIsLocal.value = proxyBase.value === PROXY_LOCAL
})
</script>

<style scoped>
.proxy-page {
  max-width: 880px;
  margin: 0 auto;
}
.mb {
  margin-bottom: 16px;
}
.block {
  margin-bottom: 16px;
}
.proxy-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.proxy-row code {
  background: var(--el-fill-color-light);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  word-break: break-all;
}
.dl-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.muted {
  color: var(--el-text-color-secondary);
  margin-top: 0;
}
@media (max-width: 767px) {
  .proxy-page {
    padding: 0 4px;
  }
}
</style>

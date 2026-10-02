<template>
  <div class="linspirer-page">
    <!-- 顶部欢迎 -->
    <div v-if="welcomeName" class="welcome">当前中育用户：{{ welcomeName }}</div>

    <el-tabs v-model="activeTab" class="linspirer-tabs">
      <!-- ===== 绑定设备 ===== -->
      <el-tab-pane label="绑定" name="bind">
        <el-form :model="form" label-position="top" class="bind-form" @submit.prevent>
          <el-form-item label="设备号 (swdid)">
            <el-input v-model="form.swdid" placeholder="请输入设备号" clearable />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input :model-value="zyName" readonly placeholder="中育用户名" />
          </el-form-item>
          <el-form-item label="设备型号">
            <el-input v-model="form.model" placeholder="如 Pixel 6" clearable />
          </el-form-item>
          <el-button
            type="primary"
            :loading="binding"
            class="bind-btn"
            @click="doBind"
          >
            <el-icon><Link /></el-icon>
            <span>绑定并获取应用</span>
          </el-button>
          <div v-if="bindStatus" class="bind-status" :class="bindStatusType">
            {{ bindStatus }}
          </div>
        </el-form>
      </el-tab-pane>

      <!-- ===== 应用管理 ===== -->
      <el-tab-pane label="应用" name="apps">
        <div v-if="!session.swdid" class="empty-hint">
          <el-icon><InfoFilled /></el-icon>
          <span>请先在「绑定」中绑定设备</span>
        </div>
        <template v-else>
          <div class="apps-header">
            <span class="apps-sub">已绑定设备：{{ session.swdid }}</span>
            <el-button text :icon="Refresh" :loading="loadingApps" @click="loadApps">
              刷新
            </el-button>
          </div>
          <div v-loading="loadingApps" class="apps-grid">
            <el-empty v-if="!loadingApps && apps.length === 0" description="暂无应用" />
            <el-card
              v-for="(app, i) in apps"
              :key="app.id || app.appid || i"
              class="app-card"
              shadow="hover"
            >
              <div class="app-card-body">
                <div class="app-icon">
                  <el-image
                    v-if="app._icon"
                    :src="app._icon"
                    fit="contain"
                    class="app-icon-img"
                  >
                    <template #error>
                      <el-icon class="app-icon-ph"><Cellphone /></el-icon>
                    </template>
                  </el-image>
                  <el-icon v-else class="app-icon-ph"><Cellphone /></el-icon>
                </div>
                <div class="app-meta">
                  <div class="app-name" :title="appName(app)">{{ appName(app) }}</div>
                  <div class="app-pkg" :title="appPkg(app)">{{ appPkg(app) }}</div>
                  <el-tag
                    size="small"
                    :type="app._source === '策略应用' ? 'primary' : 'warning'"
                  >
                    {{ app._source }}
                  </el-tag>
                </div>
              </div>
              <div class="app-actions">
                <el-button size="small" :icon="Document" @click="viewApp(app)">
                  详情
                </el-button>
                <el-button
                  size="small"
                  type="success"
                  :icon="Download"
                  @click="downloadApp(app)"
                >
                  下载
                </el-button>
              </div>
            </el-card>
          </div>
        </template>
      </el-tab-pane>

      <!-- ===== 密码计算器 ===== -->
      <el-tab-pane label="密码" name="pwd">
        <el-form :model="pwdForm" label-position="top" class="pwd-form" @submit.prevent>
          <el-form-item label="设备号 (swdid)">
            <el-input v-model="pwdForm.swdid" placeholder="留空则使用已绑定设备号" clearable />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input :model-value="zyName" readonly placeholder="中育用户名" />
          </el-form-item>
          <el-form-item label="设备型号">
            <el-input v-model="pwdForm.model" placeholder="留空则使用已绑定型号" clearable />
          </el-form-item>
          <el-button
            type="primary"
            :icon="Key"
            :loading="calcLoading"
            class="pwd-btn"
            @click="doCalc"
          >
            计算管理员密码
          </el-button>
        </el-form>

        <el-card v-if="pwdResult" class="pwd-result" shadow="never">
          <div class="pwd-label">管理员密码</div>
          <div class="pwd-value">{{ pwdResult }}</div>
          <div class="pwd-date">日期：{{ pwdDate }}</div>
          <el-button
            class="pwd-copy"
            :icon="CopyDocument"
            @click="copyPwd"
          >
            复制密码
          </el-button>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 应用详情弹窗 -->
    <el-dialog v-model="detailVisible" title="应用详情" width="420px">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <div class="detail-icon">
            <el-image
              v-if="detailIcon"
              :src="detailIcon"
              fit="contain"
              class="detail-icon-img"
            >
              <template #error>
                <el-icon class="app-icon-ph"><Cellphone /></el-icon>
              </template>
            </el-image>
            <el-icon v-else class="app-icon-ph"><Cellphone /></el-icon>
          </div>
          <h3 class="detail-name">{{ detailName }}</h3>
          <div v-if="detailPkg" class="detail-pkg">{{ detailPkg }}</div>
          <div v-if="detailVersion" class="detail-version">
            <el-tag size="small">v{{ detailVersion }}</el-tag>
          </div>
          <el-divider />
          <div class="detail-desc-label">应用描述</div>
          <p class="detail-desc">{{ detailDesc }}</p>
        </template>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="detailDownloadUrl"
          type="success"
          :icon="Download"
          @click="openDownload(detailDownloadUrl, detailName)"
        >
          下载 APK
        </el-button>
      </template>
    </el-dialog>

    <!-- 下载链接弹窗 -->
    <el-dialog v-model="dlVisible" title="下载链接" width="420px">
      <p class="dl-tip">复制以下链接到浏览器打开下载：</p>
      <el-input :model-value="dlUrl" readonly :autosize="{ minRows: 3 }" type="textarea" />
      <template #footer>
        <el-button @click="dlVisible = false">关闭</el-button>
        <el-button type="primary" :icon="CopyDocument" @click="copyDl">复制</el-button>
        <el-button type="success" :icon="Download" @click="openRawDl">直接下载</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Link,
  Refresh,
  InfoFilled,
  Cellphone,
  Document,
  Download,
  Key,
  CopyDocument
} from '@element-plus/icons-vue'
import {
  bindDevice,
  getAllApps,
  getAppDetail,
  calcPassword,
  linspirerProxyUrl,
  type LinspirerApp,
  type LinspirerSession
} from '@/api/linspirer'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const activeTab = ref('bind')
const welcomeName = ref('')
const zyName = computed(() => localStorage.getItem('loginAccount') || auth.realName || auth.userName || '')

/* ===== 绑定 ===== */
const form = reactive({ swdid: '', model: '' })
const binding = ref(false)
const bindStatus = ref('')
const bindStatusType = ref<'ok' | 'err'>('ok')
const session = reactive<LinspirerSession>({ swdid: '', account: '', model: '' })

/* ===== 应用 ===== */
const apps = ref<LinspirerApp[]>([])
const loadingApps = ref(false)

/* ===== 密码 ===== */
const pwdForm = reactive({ swdid: '', model: '' })
const calcLoading = ref(false)
const pwdResult = ref('')
const pwdDate = ref('')

/* ===== 弹窗 ===== */
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<any>(null)
const detailDownloadUrl = ref('')
const dlVisible = ref(false)
const dlUrl = ref('')

/* ===== 辅助 ===== */
function appName(a: LinspirerApp) {
  return a.name || a.appname || '未知应用'
}
function appPkg(a: LinspirerApp) {
  return a.packagename || a.pkg || ''
}

onMounted(() => {
  // 自动填充中育用户名
  if (zyName.value) welcomeName.value = zyName.value
  // 恢复上次 session
  const savedSwdid = localStorage.getItem('linspirer_swdid') || ''
  const savedModel = localStorage.getItem('linspirer_model') || ''
  const savedSid = localStorage.getItem('linspirer_studentId') || ''
  if (savedSwdid) {
    form.swdid = savedSwdid
    session.swdid = savedSwdid
  }
  session.account = zyName.value
  if (savedModel) {
    form.model = savedModel
    session.model = savedModel
  }
  if (savedSid) sessionStudentId = savedSid
  if (savedSwdid && zyName.value && savedModel) {
    activeTab.value = 'apps'
    loadApps()
  }
})

let sessionStudentId = ''

async function doBind() {
  const { swdid, model } = form
  const account = zyName.value
  if (!swdid || !account || !model) {
    bindStatus.value = '请填写设备号和设备型号（用户名取自中育）'
    bindStatusType.value = 'err'
    return
  }
  binding.value = true
  bindStatus.value = ''
  try {
    await bindDevice(swdid, account, model)
    bindStatus.value = '设备绑定成功，正在获取应用列表...'
    bindStatusType.value = 'ok'

    await loadApps()

    // 保存 session
    session.swdid = swdid
    session.account = account
    session.model = model
    localStorage.setItem('linspirer_swdid', swdid)
    localStorage.setItem('linspirer_model', model)

    bindStatus.value = `获取成功，共 ${apps.value.length} 个应用`
    activeTab.value = 'apps'
  } catch (e: any) {
    bindStatus.value = '操作失败：' + (e.message || e)
    bindStatusType.value = 'err'
  } finally {
    binding.value = false
  }
}

async function loadApps() {
  if (!session.swdid || !session.account || !session.model) return
  loadingApps.value = true
  try {
    const list = await getAllApps(session.swdid, session.account, session.model)
    // 逐个获取详情以加载图标
    for (const app of list) {
      const appId = app.id || app.appid
      if (!appId) continue
      try {
        const d = await getAppDetail(session.swdid, session.account, session.model, appId)
        const data = d.data || d
        app._icon = linspirerProxyUrl(data.iconpath || data.icon || data.appicon || '')
      } catch {
        /* 图标加载失败忽略 */
      }
    }
    apps.value = list
  } catch (e: any) {
    ElMessage.error('获取应用失败：' + (e.message || e))
  } finally {
    loadingApps.value = false
  }
}

async function viewApp(app: LinspirerApp) {
  const appId = app.id || app.appid
  if (!appId) return
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  detailDownloadUrl.value = ''
  try {
    const d = await getAppDetail(session.swdid, session.account, session.model, appId)
    const data = d.data || d
    detail.value = data
    const path = data.path ? data.path + session.swdid : ''
    detailDownloadUrl.value = path ? linspirerProxyUrl(path) : ''
  } catch (e: any) {
    ElMessage.error('获取详情失败：' + (e.message || e))
  } finally {
    detailLoading.value = false
  }
}

const detailName = computed(() => {
  const d = detail.value
  return d ? d.name || d.appname || '未知' : ''
})
const detailPkg = computed(() => {
  const d = detail.value
  return d ? d.packagename || d.pkg || '' : ''
})
const detailVersion = computed(() => {
  const d = detail.value
  return d ? d.version || d.appversion || '' : ''
})
const detailDesc = computed(() => {
  const d = detail.value
  return d ? d.description || d.desc || '无描述' : ''
})
const detailIcon = computed(() => {
  const d = detail.value
  return d ? linspirerProxyUrl(d.iconpath || d.icon || d.appicon || '') : ''
})

function downloadApp(app: LinspirerApp) {
  const appId = app.id || app.appid
  if (!appId) return
  getAppDetail(session.swdid, session.account, session.model, appId)
    .then((d) => {
      const data = d.data || d
      const path = data.path ? data.path + session.swdid : ''
      if (!path) {
        ElMessage.warning('该应用没有下载链接')
        return
      }
      openDownload(linspirerProxyUrl(path), appName(app))
    })
    .catch((e) => ElMessage.error('下载失败：' + (e.message || e)))
}

function openDownload(url: string, name: string) {
  dlUrl.value = url
  dlVisible.value = true
  void name
}

function copyDl() {
  navigator.clipboard
    .writeText(dlUrl.value)
    .then(() => ElMessage.success('已复制下载链接'))
    .catch(() => ElMessage.error('复制失败'))
}
function openRawDl() {
  window.open(dlUrl.value, '_blank')
}

async function doCalc() {
  const swdid = pwdForm.swdid.trim() || session.swdid
  const account = zyName.value || session.account
  const model = pwdForm.model.trim() || session.model
  if (!swdid) {
    ElMessage.warning('请先填写设备号')
    return
  }
  calcLoading.value = true
  try {
    const pwd = await calcPassword(swdid, account, model, sessionStudentId || undefined)
    pwdResult.value = pwd
    pwdDate.value = new Date().toLocaleDateString()
    if (session.swdid === swdid && !sessionStudentId) {
      // 尝试缓存 studentId（若本次联网取到）
    }
  } catch (e: any) {
    ElMessage.error('计算失败：' + (e.message || e))
  } finally {
    calcLoading.value = false
  }
}

function copyPwd() {
  navigator.clipboard
    .writeText(pwdResult.value)
    .then(() => ElMessage.success('已复制密码'))
    .catch(() => ElMessage.error('复制失败'))
}
</script>

<style scoped>
.linspirer-page {
  max-width: 960px;
  margin: 0 auto;
}
.welcome {
  padding: 4px 2px 12px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.linspirer-tabs {
  --el-tabs-header-height: 48px;
}
.bind-form,
.pwd-form {
  max-width: 420px;
  padding-top: 8px;
}
.bind-btn,
.pwd-btn {
  width: 100%;
}
.bind-status {
  margin-top: 12px;
  font-size: 14px;
}
.bind-status.ok {
  color: var(--el-color-success);
}
.bind-status.err {
  color: var(--el-color-danger);
}
.empty-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 32px 8px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.apps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.apps-sub {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  min-height: 120px;
}
.app-card {
  border-radius: 8px;
}
.app-card-body {
  display: flex;
  align-items: center;
  gap: 12px;
}
.app-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.app-icon-img {
  width: 48px;
  height: 48px;
}
.app-icon-ph {
  font-size: 22px;
  color: var(--el-text-color-placeholder);
}
.app-meta {
  min-width: 0;
  flex: 1;
}
.app-name {
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-pkg {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 2px 0 4px;
}
.app-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.pwd-result {
  margin-top: 16px;
  text-align: center;
  border-radius: 8px;
}
.pwd-label {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.pwd-value {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: 6px;
  font-family: monospace;
  margin: 8px 0;
  color: var(--el-color-primary);
}
.pwd-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pwd-copy {
  margin-top: 12px;
}
.detail-body {
  min-height: 120px;
}
.detail-icon {
  text-align: center;
  margin-bottom: 12px;
}
.detail-icon-img {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  background: var(--el-fill-color-light);
}
.detail-name {
  text-align: center;
  margin: 0 0 4px;
}
.detail-pkg {
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.detail-version {
  text-align: center;
  margin-top: 6px;
}
.detail-desc-label {
  font-weight: 600;
  margin-bottom: 4px;
}
.detail-desc {
  color: var(--el-text-color-regular);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.dl-tip {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 0;
}

/* ===== 移动端适配 ===== */
@media (max-width: 767px) {
  .linspirer-page {
    padding: 0 4px;
  }
  .apps-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .app-card {
    border-radius: 6px;
  }
  .bind-form,
  .pwd-form {
    max-width: 100%;
  }
}
</style>

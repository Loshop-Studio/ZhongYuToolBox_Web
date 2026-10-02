<template>
  <div class="app-downloads">
    <el-card shadow="never">
      <h2>中育学生应用</h2>
      <p class="muted">从学校官方更新服务查询 Android 应用，也可导入已核实的软件包。图库集成在中育桌面中。</p>
      <p class="muted">当前学校接口：{{ server }} · 下载 APK 后自行传到平板。安装和课程访问仍受平板设置及账号权限影响。</p>
      <div class="toolbar">
        <el-input v-model="search" placeholder="搜索应用名称或包名" clearable aria-label="搜索中育应用" />
        <el-button :icon="Refresh" :loading="loading" :disabled="!!downloading || importing" @click="load">刷新版本</el-button>
        <el-upload :show-file-list="false" accept=".apk,.zip,.1" :before-upload="importPackage" :disabled="importing || !!downloading">
          <el-button :icon="Upload" :loading="importing" :disabled="!!downloading">导入本地 APK / ZIP</el-button>
        </el-upload>
      </div>
      <el-form class="package-query" @submit.prevent="queryPackage">
        <el-input v-model="packageQuery" placeholder="也可输入完整包名查询学生端版本" aria-label="查询 Android 包名" />
        <el-button native-type="submit" :loading="querying" :disabled="loading || !!downloading">查询包名</el-button>
      </el-form>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p class="muted">导入仅在本机保存，按 APK 的 SHA-256 核对包名与版本；支持 2026-10-02 软件包中的 6 个应用及中育桌面 APK。在线服务可能返回其他版本。</p>
      <p v-if="importStatus" role="status" class="muted">{{ importStatus }}</p>
      <p v-for="message in importErrors" :key="message" role="alert" class="error">{{ message }}</p>
    </el-card>
    <el-card v-if="downloading" shadow="never" class="download-progress">
      <div class="progress-header"><strong>{{ downloading }}</strong><el-button :disabled="downloadPhase === '请选择保存位置'" @click="cancelDownload">取消下载</el-button></div>
      <el-progress :percentage="percentage" />
      <p class="muted" aria-live="polite">{{ downloadPhase }} · {{ sizeText(received) }} / {{ sizeText(total) }}</p>
    </el-card>
    <el-card v-if="receipt" shadow="never" class="receipt">
      <strong>{{ receipt.name }} 已保存</strong>
      <p class="muted">安装包校验通过。以下 SHA-256 用于核对传输前后文件是否一致，不代表独立的官方签名验证。</p>
      <code>{{ receipt.sha256 }}</code>
    </el-card>
    <div v-loading="loading" class="apps-grid">
      <el-card v-for="entry in visibleApps" :key="entry.packageName" shadow="never" class="app-card">
        <div class="app-heading">
          <el-image v-if="entry.app?.icon" :src="entry.app.icon" fit="contain" class="app-icon"><template #error><el-icon><Cellphone /></el-icon></template></el-image>
          <el-icon v-else class="app-icon"><Cellphone /></el-icon>
          <div><h3>{{ entry.name }}</h3><span class="muted">{{ entry.app ? '官方在线 v' + entry.app.versionName + ' · ' + sizeText(entry.app.size) : '暂无在线版本' }}</span></div>
        </div>
        <p class="package-name">{{ entry.packageName }}</p>
        <p v-if="entry.packageName === 'com.zykj.manage'" class="muted">桌面内含图库、用户中心。在线接口仍可能提供旧用户中心，不能视为同一桌面版本。</p>
        <p v-if="entry.app && entry.app.name !== entry.name" class="muted">官方在线名称：{{ entry.app.name }}</p>
        <p v-if="localApps[entry.packageName]" class="muted">已导入 v{{ localApps[entry.packageName].versionName }} · {{ sizeText(localApps[entry.packageName].size) }} · SHA-256 已核对</p>
        <p v-else-if="entry.versionName" class="muted">附件参考版本 v{{ entry.versionName }} · 导入后可离线保存 APK</p>
        <p v-if="entry.error" class="muted" role="status">{{ entry.error }}</p>
        <div class="actions">
          <el-button v-if="localApps[entry.packageName]" type="primary" :icon="Download" :disabled="!!downloading || importing" @click="saveLocal(localApps[entry.packageName])">保存已导入 APK</el-button>
          <el-button type="primary" :icon="Download" :disabled="!entry.app || !!downloading || loading" @click="download(entry.app!)">下载 APK</el-button>
          <el-button :disabled="!entry.app" @click="copyUrl(entry.app!)">复制官方链接</el-button>
        </div>
      </el-card>
    </div>
    <el-empty v-if="!loading && !visibleApps.length" description="没有匹配的应用" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Download, Cellphone, Upload } from '@element-plus/icons-vue'
import { API_BASE_URL } from '@/config'
import { useAuthStore } from '@/stores/auth'
import { STUDENT_APPS, getStudentApp, downloadOfficialApk, appFilename, type OfficialApp } from '@/api/appStore'
import { saveBlobFile } from '@/utils/saveFile'
import { importOfficialApks, readLocalOfficialApks, identifyOfficialApk, type LocalOfficialApk } from '@/utils/officialApks'

const auth = useAuthStore()
const server = computed(() => auth.apiBaseUrl || API_BASE_URL)
interface Entry { name: string; packageName: string; aliases?: string; versionName?: string; app?: OfficialApp; error?: string }
const entries = ref<Entry[]>(STUDENT_APPS.map(app => ({ ...app })))
const search = ref(''), packageQuery = ref(''), loading = ref(false), querying = ref(false), error = ref('')
const downloading = ref(''), received = ref(0), total = ref(0), downloadPhase = ref('正在下载')
const receipt = ref<{ name: string; sha256: string } | null>(null)
const localApps = ref<Record<string, LocalOfficialApk>>({})
const importing = ref(false), importStatus = ref(''), importErrors = ref<string[]>([])
let listController: AbortController | undefined, downloadController: AbortController | undefined
let disposed = false
const visibleApps = computed(() => entries.value.filter(entry => `${entry.name} ${entry.app?.name || ''} ${entry.aliases || ''} ${entry.packageName}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const percentage = computed(() => total.value ? Math.min(100, Math.floor(received.value / total.value * 100)) : 0)
function sizeText(size: number) { return (size / 1024 / 1024).toFixed(1) + ' MiB' }
async function readLocal() {
  const apps = await readLocalOfficialApks()
  if (!disposed) localApps.value = Object.fromEntries(apps.map(app => [app.packageName, app]))
}
async function importPackage(file: File) {
  if (importing.value || downloading.value) return false
  importing.value = true; importErrors.value = []; importStatus.value = '正在核对安装包…'
  try {
    const result = await importOfficialApks(file, (done, total) => { importStatus.value = `正在导入 ${done} / ${total}` })
    await readLocal()
    if (!disposed) {
      importStatus.value = `已在本机保存 ${result.imported.length} 个应用`
      importErrors.value = result.failed
      if (result.imported.length) ElMessage.success(importStatus.value)
    }
  } catch (e) { if (!disposed) { importErrors.value = [(e as Error).message]; importStatus.value = '导入未完成' } }
  finally { importing.value = false }
  return false
}
async function saveLocal(app: LocalOfficialApk) {
  if (downloading.value || importing.value) return
  const current = downloadController = new AbortController()
  downloading.value = app.name; received.value = 0; total.value = app.size; receipt.value = null; downloadPhase.value = '正在核对本地安装包'
  try {
    const verified = await identifyOfficialApk(new Uint8Array(await app.blob.arrayBuffer()))
    current.signal.throwIfAborted()
    received.value = verified.size; downloadPhase.value = '请选择保存位置'
    await saveBlobFile(app.blob, `${verified.name}-${verified.versionName}.apk`)
    if (!disposed && !current.signal.aborted) { receipt.value = { name: verified.name, sha256: verified.sha256 }; ElMessage.success('APK 已保存') }
  } catch (e) { if (!disposed) ElMessage[current.signal.aborted ? 'info' : 'error'](current.signal.aborted ? '保存已取消' : (e as Error).message) }
  finally { downloading.value = ''; downloadController = undefined }
}

async function readEntry(entry: Entry, base: string, signal: AbortSignal): Promise<Entry> {
  try {
    const app = await getStudentApp(entry.packageName, base, signal)
    return app ? { ...entry, app, error: undefined } : { ...entry, app: undefined, error: '官方未提供可下载的学生端版本' }
  } catch (e) { return { ...entry, app: undefined, error: '查询失败：' + (e as Error).message } }
}
async function load() {
  listController?.abort()
  const current = listController = new AbortController(), base = server.value
  loading.value = true; querying.value = false; error.value = ''
  const result = await Promise.all(entries.value.map(entry => readEntry(entry, base, current.signal)))
  if (current.signal.aborted || disposed || base !== server.value) return
  entries.value = result; loading.value = false
}
async function queryPackage() {
  if (loading.value || querying.value || downloading.value) return
  const pkg = packageQuery.value.trim(), base = server.value
  const current = listController = new AbortController()
  querying.value = true; error.value = ''
  const known = entries.value.find(item => item.packageName === pkg)
  const entry = await readEntry(known || { name: pkg, packageName: pkg }, base, current.signal)
  if (current.signal.aborted || disposed || base !== server.value) return
  if (entry.app) {
    entries.value = [...entries.value.filter(item => item.packageName !== pkg), entry]
    search.value = pkg
  } else error.value = entry.error || '未找到学生端版本'
  querying.value = false
}
async function copyUrl(app: OfficialApp) {
  try { await navigator.clipboard.writeText(app.fileUrl); ElMessage.success('已复制官方 APK 地址') }
  catch { ElMessage.error('复制失败，请检查剪贴板权限') }
}
function cancelDownload() { downloadController?.abort() }
async function download(app: OfficialApp) {
  if (downloading.value || importing.value) return
  const current = downloadController = new AbortController()
  downloading.value = app.name; received.value = 0; total.value = app.size; receipt.value = null; downloadPhase.value = '正在下载'
  try {
    const result = await downloadOfficialApk(app, current.signal, (count, size) => {
      received.value = count; total.value = size
      if (count === size) downloadPhase.value = '正在检查安装包'
    })
    current.signal.throwIfAborted()
    downloadPhase.value = '请选择保存位置'
    await saveBlobFile(result.blob, appFilename(app))
    if (!disposed && !current.signal.aborted) { receipt.value = { name: app.name, sha256: result.sha256 }; ElMessage.success('APK 已保存') }
  } catch (e) {
    if (!disposed) ElMessage[current.signal.aborted ? 'info' : 'error'](current.signal.aborted ? '下载已取消' : (e as Error).message)
  } finally { downloading.value = ''; downloadController = undefined }
}
watch(server, () => { cancelDownload(); receipt.value = null; entries.value = STUDENT_APPS.map(app => ({ ...app })); void load() })
onMounted(() => { void load(); void readLocal().catch(e => { importErrors.value = ['本地 APK 读取失败：' + (e as Error).message] }) })
onBeforeUnmount(() => { disposed = true; listController?.abort(); downloadController?.abort() })
</script>

<style scoped>
.app-downloads { display: grid; gap: 18px; }
h2, h3, p { margin: 0 0 12px; }
h2 { font-size: 21px; } h3 { font-size: 17px; }
.muted { color: var(--el-text-color-secondary); line-height: 1.7; }
.toolbar, .package-query, .actions, .progress-header, .app-heading { display: flex; align-items: center; gap: 12px; }
.package-query { margin-top: 12px; }
.toolbar .el-input, .package-query .el-input { flex: 1; }
.apps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; min-height: 90px; }
.app-card :deep(.el-card__body) { height: 100%; display: flex; flex-direction: column; }
.app-icon { width: 48px; height: 48px; flex-shrink: 0; font-size: 30px; color: var(--el-color-primary); }
.app-heading h3 { margin-bottom: 4px; }
.package-name { margin-top: 14px; overflow-wrap: anywhere; font-size: 12px; color: var(--el-text-color-secondary); }
.actions { margin-top: auto; flex-wrap: wrap; padding-top: 12px; }
.actions .el-button { margin-left: 0; }
.progress-header { justify-content: space-between; margin-bottom: 14px; }
.error { color: var(--el-color-danger); margin-top: 12px; }
.receipt code { display: block; overflow-wrap: anywhere; user-select: all; font-size: 12px; }
@media (max-width: 600px) { .toolbar, .package-query { flex-wrap: wrap; } .apps-grid { grid-template-columns: 1fr; } }
</style>

<template>
  <section aria-label="检查应用更新">
    <div class="update-heading"><div><h2>检查更新</h2><p>当前版本 {{ APP_VERSION }} · {{ platformName }}</p></div><el-button type="primary" :loading="checking" @click="check">{{ checking ? '检查中…' : '检查更新' }}</el-button></div>
    <p class="muted">检查当前发行仓库的正式版；下载与安装由你确认。</p>
    <el-alert v-if="error" :title="error" type="warning" :closable="false" show-icon />
    <template v-if="release">
      <el-alert :title="comparison === null ? '版本标签无法自动比较，请查看发布说明' : comparison > 0 ? `发现新版本 ${release.tag}` : comparison < 0 ? '当前运行版本高于最新正式版' : '当前已是最新正式版'" :type="comparison !== null && comparison > 0 ? 'success' : 'info'" :closable="false" show-icon />
      <h3>{{ release.title }}</h3><p class="muted">{{ release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : '' }}</p>
      <h4>版本功能与改动</h4><pre class="release-notes">{{ release.notes }}</pre>
      <div class="download-list"><a v-for="asset in platformAssets" :key="asset.url" :href="asset.url" target="_blank" rel="noopener noreferrer">{{ asset.name }} · {{ (asset.size / 1048576).toFixed(1) }} MB</a></div>
    </template>
    <p><a :href="release?.url || releasesUrl" target="_blank" rel="noopener noreferrer">在 GitHub 查看发布与下载 ↗</a></p>
  </section>
</template>
<script setup lang="ts">
import { ref, shallowRef, computed, onBeforeUnmount } from 'vue'
import { APP_VERSION, PLATFORM, IS_WINDOWS } from '@/config'
import { RELEASE_REPOSITORY } from '@/config/edition'
import { fetchLatestRelease, compareVersions, type AppRelease } from '@/utils/appUpdate'
const platform: string = PLATFORM
const checking = ref(false), error = ref(''), release = shallowRef<AppRelease | null>(null)
const comparison = computed(() => release.value ? compareVersions(release.value.tag, APP_VERSION) : null)
const platformName = IS_WINDOWS ? 'Windows' : platform === 'ios' ? 'iPhone / iPad' : platform === 'android' || platform === 'plus' ? 'Android / 移动端' : '网页预览'
const releasesUrl = `https://github.com/${RELEASE_REPOSITORY}/releases`
const platformAssets = computed(() => (release.value?.assets || []).filter(a => IS_WINDOWS ? /\.(exe|zip)$/i.test(a.name) && /windows/i.test(a.name) : platform === 'ios' ? /\.ipa$/i.test(a.name) : platform === 'android' || platform === 'plus' ? /\.apk$/i.test(a.name) : /\.(exe|apk|ipa)$/i.test(a.name)))
let controller: AbortController | null = null
async function check() {
  if (checking.value) return
  const ctl = controller = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000)
  checking.value = true; error.value = ''; release.value = null
  try { const result = await fetchLatestRelease(RELEASE_REPOSITORY, ctl.signal); if (!ctl.signal.aborted) release.value = result }
  catch (e) { if (controller === ctl) error.value = ctl.signal.aborted ? '检查超时，请重试或直接打开 GitHub 发布页' : e instanceof Error ? e.message : String(e) }
  finally { clearTimeout(timer); if (controller === ctl) { checking.value = false; controller = null } }
}
onBeforeUnmount(() => { const ctl = controller; controller = null; ctl?.abort() })
</script>
<style scoped>
.update-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }.update-heading h2 { margin:0; }.update-heading p,.muted { color:var(--el-text-color-secondary); }.release-notes { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; line-height:1.7; padding:16px; background:var(--el-fill-color-light); border-radius:12px; }.download-list { display:flex; flex-direction:column; gap:12px; overflow-wrap:anywhere; }
</style>

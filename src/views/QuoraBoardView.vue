<template>
  <div class="board-view">
    <header class="appbar"><el-button :icon="ArrowLeft" aria-label="返回问题详情" @click="goBack">返回</el-button><strong>随身答画板</strong></header>
    <section class="export-toolbar" aria-label="画板导出">
      <span class="board-info">{{ info ? `${info.kind === 'recording' ? '录制' : '静态'} · ${info.pages} 页` : '正在读取画板' }}</span>
      <el-button :disabled="!info || busy" :icon="Download" @click="exportFile('svg')">{{ info?.kind === 'recording' ? '最终画面 SVG' : '导出 SVG' }}</el-button>
      <template v-if="info?.kind === 'recording'">
        <el-select v-model="quality" :disabled="busy" aria-label="视频画质" class="quality"><el-option v-for="q in qualities" :key="q.key" :label="q.label" :value="q.key" /></el-select>
        <el-button type="primary" :disabled="busy || !canEncode" :icon="Download" @click="exportFile('mp4')">导出 MP4</el-button>
      </template>
      <el-button v-if="busy" @click="exportCtl?.abort()">取消导出</el-button>
    </section>
    <p v-if="info?.kind === 'recording' && !canEncode" class="hint">此设备未提供 WebCodecs 视频编码，可导出最终画面 SVG，或在 Windows 版导出 MP4。</p>
    <p v-if="status" class="hint" role="status">{{ status }}</p>
    <div class="board-body">
      <el-result v-if="error" icon="error" title="画板加载失败" :sub-title="error"><template #extra><el-button @click="load">重新加载</el-button></template></el-result>
      <div v-else-if="!blob" class="board-ph"><el-icon class="is-loading"><Loading /></el-icon><span>加载画板中…</span></div>
      <EzyBoardViewer v-else ref="viewerRef" :source="blob" :file-name="fileName" :context-menu="false" :autoplay="false" class="board" @loaded="info = $event" @error="onError" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ArrowLeft, Download, Loading } from '@element-plus/icons-vue'
import { EzyBoardViewer, MP4_QUALITY, type EzyBoardLoadedInfo, type EzyBoardViewerInstance } from 'ezy-board-viewer'
import { fetchContentBlob } from '@/api/quora'
import { saveBlobFile } from '@/utils/saveFile'
const route = useRoute(), router = useRouter()
const blob = shallowRef<Blob | null>(null), info = ref<EzyBoardLoadedInfo | null>(null), viewerRef = ref<EzyBoardViewerInstance | null>(null)
const error = ref(''), status = ref(''), busy = ref(false), quality = ref<'low' | 'mid' | 'high'>('mid')
const canEncode = typeof (globalThis as any).VideoEncoder === 'function', qualities = Object.values(MP4_QUALITY)
const fileName = computed(() => String(route.query.name || '随身答画板').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120))
let epoch = 0, loadCtl: AbortController | null = null, exportCtl: AbortController | null = null
function stop() { epoch++; loadCtl?.abort(); exportCtl?.abort(); viewerRef.value?.pause() }
async function load() {
  stop(); const current = epoch, ctl = loadCtl = new AbortController()
  blob.value = null; info.value = null; error.value = ''; status.value = ''
  const url = String(route.query.content || '')
  if (!url) { error.value = '缺少画板资源地址'; return }
  try { const result = await fetchContentBlob(url, ctl.signal); if (current === epoch) blob.value = result }
  catch (e) { if (current === epoch && !ctl.signal.aborted) error.value = e instanceof Error ? e.message : String(e) }
}
function onError(e: unknown) { error.value = e instanceof Error ? e.message : String(e) }
async function exportFile(type: 'svg' | 'mp4') {
  if (!viewerRef.value || !info.value || busy.value) return
  const current = epoch, viewer = viewerRef.value, name = fileName.value, ctl = exportCtl = new AbortController()
  busy.value = true; status.value = '正在本地生成文件…'
  let silent = false
  try {
    const file = type === 'svg' ? await viewer.exportSvg() : await viewer.exportMp4({ quality: quality.value, signal: ctl.signal, onProgress(stage, fraction) {
      if (current !== epoch) return
      if (stage === 'noaudio') silent = true
      status.value = stage === 'mix' ? '正在混合音频…' : `正在本地编码 ${Math.round(fraction * 100)}%${silent ? '（无音轨）' : ''}`
    } })
    if (current !== epoch || ctl.signal.aborted) return
    status.value = '请选择保存位置…'
    await saveBlobFile(file, `${name}${type === 'mp4' ? '-' + quality.value : ''}.${type}`, { localOnly: true })
    if (current === epoch) status.value = `文件已交给系统保存${silent ? '；设备不支持 AAC，MP4 无音轨' : ''}`
  } catch (e) { if (current === epoch) status.value = ctl.signal.aborted || (e as Error)?.name === 'AbortError' ? '已取消导出' : `导出未完成：${e instanceof Error ? e.message : String(e)}` }
  finally { if (exportCtl === ctl) { exportCtl = null; busy.value = false } }
}
function goBack() { if (window.history.length > 1) router.back(); else router.replace('/quora') }
watch(() => [route.query.content, route.query.name], load, { immediate: true })
onBeforeRouteLeave(stop); onBeforeUnmount(stop)
</script>
<style scoped>
.board-view { display:flex; flex-direction:column; height:100%; min-height: min(600px,75dvh); background:var(--el-fill-color-light); }
.appbar { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--el-border-color-light); background:var(--el-bg-color); }
.export-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:12px 14px; background:var(--el-bg-color); }
.export-toolbar .el-button { margin-left:0; }.quality { width:165px; }.board-info { color:var(--el-text-color-secondary); margin-right:auto; }
.board-body { flex:1; min-height:220px; padding:12px; }.board { width:100%; height:100%; min-height:220px; }.hint { margin:0; padding:6px 14px; font-size:13px; line-height:1.6; color:var(--el-text-color-secondary); }
.board-ph { display:flex; align-items:center; justify-content:center; gap:8px; height:100%; }
@media(max-width:600px) { .board-view { min-height:65dvh; }.board-body { padding:6px; }.board-info { width:100%; }.export-toolbar { gap:8px; } }
</style>

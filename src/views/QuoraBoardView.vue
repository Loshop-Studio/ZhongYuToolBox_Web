<template>
  <div class="board-view">
    <!-- 顶部返回栏：导出操作并入标题栏（桌面端直接放按钮，移动端收进 ⋯ 底部面板） -->
    <header class="appbar">
      <button type="button" class="back" aria-label="返回问题详情" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <span class="appbar-title">随身答画板</span>

      <!-- 桌面端：标题栏右侧直接放导出控件 -->
      <template v-if="!isMobile">
        <span class="board-info">{{ info ? `${info.kind === 'recording' ? '录制' : '静态'} · ${info.pages} 页` : '正在读取画板' }}</span>
        <el-button :disabled="!info || busy" :icon="Download" @click="exportFile('svg')">{{ info?.kind === 'recording' ? '最终画面 SVG' : '导出 SVG' }}</el-button>
        <template v-if="info?.kind === 'recording'">
          <el-select v-model="quality" :disabled="busy" aria-label="视频画质" class="quality"><el-option v-for="q in qualities" :key="q.key" :label="q.label" :value="q.key" /></el-select>
          <el-button type="primary" :disabled="busy || !canEncode" :icon="Download" @click="exportFile('mp4')">导出 MP4</el-button>
        </template>
        <el-button v-if="busy" @click="exportCtl?.abort()">取消导出</el-button>
      </template>

      <!-- 移动端：三个点按钮 + 底部弹出面板（参考笔记详情） -->
      <template v-else>
        <button type="button" class="more-btn" aria-label="更多操作" @click="showSheet = true">
          <el-icon><MoreFilled /></el-icon>
        </button>
        <Teleport to="body">
          <div v-if="showSheet" class="actions-mask" @click="showSheet = false" />
          <div v-if="showSheet" class="actions-sheet">
            <div class="actions-item" @click="onAction('svg')">
              <el-icon><Download /></el-icon>
              <span>{{ info?.kind === 'recording' ? '导出最终画面 SVG' : '导出 SVG' }}</span>
            </div>
            <template v-if="info?.kind === 'recording'">
              <div class="actions-item actions-item--static">
                <el-icon><VideoCamera /></el-icon>
                <span>MP4 画质</span>
                <el-select v-model="quality" size="small" aria-label="视频画质" class="sheet-quality"><el-option v-for="q in qualities" :key="q.key" :label="q.label" :value="q.key" /></el-select>
              </div>
              <div class="actions-item" :class="{ 'is-disabled': !canEncode }" @click="canEncode && onAction('mp4')">
                <el-icon><Download /></el-icon>
                <span>{{ canEncode ? '导出 MP4' : '导出 MP4（设备不支持编码）' }}</span>
              </div>
            </template>
            <div v-if="busy" class="actions-item" @click="exportCtl?.abort()">
              <el-icon><CloseBold /></el-icon><span>取消导出</span>
            </div>
            <div class="actions-cancel" @click="showSheet = false">取消</div>
          </div>
        </Teleport>
      </template>
    </header>

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
import { ArrowLeft, Download, Loading, MoreFilled, VideoCamera, CloseBold } from '@element-plus/icons-vue'
import { EzyBoardViewer, MP4_QUALITY, type EzyBoardLoadedInfo, type EzyBoardViewerInstance } from 'ezy-board-viewer'
import { fetchContentBlob } from '@/api/quora'
import { saveBlobFile } from '@/utils/saveFile'
import { useIsMobile } from '@/composables/useIsMobile'
const route = useRoute(), router = useRouter()
const { isMobile } = useIsMobile()
const blob = shallowRef<Blob | null>(null), info = ref<EzyBoardLoadedInfo | null>(null), viewerRef = ref<EzyBoardViewerInstance | null>(null)
const error = ref(''), status = ref(''), busy = ref(false), quality = ref<'low' | 'mid' | 'high'>('mid')
const showSheet = ref(false)
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
/** 移动端底部面板命令分发 */
function onAction(type: 'svg' | 'mp4') { showSheet.value = false; exportFile(type) }
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
/* 顶部 sticky 返回栏：导出操作并入标题栏（参考笔记详情 appbar，高度与旧版一致） */
.appbar { position:sticky; top:0; z-index:50; display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--el-bg-color); border-bottom:1px solid var(--el-border-color-light); }
.appbar .back { display:flex; align-items:center; justify-content:center; width:32px; height:32px; flex-shrink:0; font-size:20px; color:var(--el-text-color-regular); background:transparent; border:none; padding:0; cursor:pointer; border-radius:50%; transition:background .2s; }
.appbar .back:hover { background:var(--el-fill-color-light); }
.appbar-title { flex:1; min-width:0; font-size:17px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.appbar .el-button { margin-left:0; }
.board-info { color:var(--el-text-color-secondary); font-size:13px; white-space:nowrap; }
.quality { width:150px; }
/* 移动端三点按钮（参考笔记详情 ContentActionsMenu） */
.more-btn { width:32px; height:32px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:18px; color:var(--el-text-color-primary); background:transparent; border:none; padding:0; cursor:pointer; border-radius:50%; transition:background .2s; }
.more-btn:hover { background:var(--el-fill-color-light); }
/* 移动端底部弹出面板（带遮罩） */
.actions-mask { position:fixed; inset:0; z-index:2000; background:rgba(0,0,0,.45); }
.actions-sheet { position:fixed; left:0; right:0; bottom:0; z-index:2001; padding:8px 0 calc(8px + env(safe-area-inset-bottom)); background:var(--el-bg-color); border-top-left-radius:14px; border-top-right-radius:14px; box-shadow:0 -4px 16px rgba(0,0,0,.12); }
.actions-item { display:flex; align-items:center; gap:10px; padding:15px 20px; font-size:16px; color:var(--el-text-color-primary); cursor:pointer; }
.actions-item:active { background:var(--el-fill-color-light); }
.actions-item--static { cursor:default; }
.actions-item--static:active { background:transparent; }
.actions-item.is-disabled { color:var(--el-text-color-disabled); cursor:not-allowed; }
.actions-item span { flex:1; }
.actions-item .sheet-quality { width:110px; flex-shrink:0; }
.actions-cancel { margin-top:6px; padding:15px 20px; text-align:center; font-size:16px; color:var(--el-text-color-secondary); border-top:1px solid var(--el-border-color-lighter); cursor:pointer; }
.board-body { flex:1; min-height:220px; padding:12px; }.board { width:100%; height:100%; min-height:220px; }.hint { margin:0; padding:6px 14px; font-size:13px; line-height:1.6; color:var(--el-text-color-secondary); }
.board-ph { display:flex; align-items:center; justify-content:center; gap:8px; height:100%; }
@media(max-width:600px) { .board-view { min-height:65dvh; }.board-body { padding:6px; } }
</style>

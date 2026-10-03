<script setup>
import { ref, reactive, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  ElButton, ElButtonGroup, ElDropdown, ElDropdownMenu, ElDropdownItem,
  ElSlider, ElIcon, ElProgress, ElAlert, ElMessage
} from 'element-plus'
import { ZoomIn, ZoomOut, VideoPlay, VideoPause, Mute, Microphone, Loading, Close, Picture, VideoCamera } from '@element-plus/icons-vue'
import { detect, convert, loadRec, pageAt, paintPage, exportMp4 as encodeMp4, openSource, mergeSvgs, MP4_QUALITY, ts } from './core/board.js'

defineOptions({ name: 'EzyBoardViewer' })

const props = defineProps({
  /** zip（Blob / File / ArrayBuffer / Uint8Array / URL 字符串，组件自己 fetch）、文件列表 [{ path, blob }]，或 createBoard() 返回的画板 */
  source: { type: [Blob, String, ArrayBuffer, Array, Object], default: null },
  /** 'auto' 自动识别；也可强制 'static' / 'recording' */
  mode: { type: String, default: 'auto' },
  autoplay: { type: Boolean, default: true },
  loop: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  speeds: { type: Array, default: () => [0.5, 0.75, 1, 1.25, 1.5, 2] },
  /** 音频起点的计时基准：'chain' 按 _audio.bin 自身命令链；'segment' 每段录制从 RECORD_STOP 后重新计时 */
  audioAnchor: { type: String, default: 'chain' },
  /** 缩放范围，相对"适应窗口"的倍数 */
  minZoom: { type: Number, default: 0.25 },
  maxZoom: { type: Number, default: 8 },
  /** 导出文件名（不含扩展名） */
  fileName: { type: String, default: 'board' },
  fetchOptions: { type: Object, default: undefined },
  /** 右键 / 长按菜单 */
  contextMenu: { type: Boolean, default: true }
})
const emit = defineEmits(['loaded', 'error', 'play', 'pause', 'ended', 'timeupdate'])

const QUALITY = Object.values(MP4_QUALITY)
const GAP = 16

/* ---------------- 状态 ---------------- */
const vp = ref(null), cv = ref(null), dd = ref(null)
const phase = ref('idle'), kind = ref(''), errMsg = ref('')
const pages = shallowRef([])           // 静态：[{ url, w, h, err }]
const rec = shallowRef(null)           // 录制：loadRec 结果
const cdim = reactive({ w: 0, h: 0 })  // 录制画布当前尺寸
const view = reactive({ s: 1, tx: 0, ty: 0 })
const box = reactive({ w: 0, h: 0 })
const playing = ref(false), pos = ref(0), rate = ref(1), isMuted = ref(props.muted)
const exporting = ref(null)            // { stage, frac }
const rectAt = (x, y) => ({ x, y, width: 0, height: 0, top: y, left: x, right: x, bottom: y })   // 虚拟触发点，不依赖 DOMRect（兼容 SSR）
const menuPos = ref(rectAt(0, 0))
const trigRef = ref({ getBoundingClientRect: () => menuPos.value })

let zip = null, token = 0, fit = 1, touched = false
let raf = 0, b0 = 0, w0 = 0, seeking = false, needDraw = true, els = [], lastEmit = 0, abortCtl = null

const total = computed(() => (rec.value ? rec.value.total : 0))
const content = computed(() => {
  if (kind.value === 'recording' && rec.value) return { w: rec.value.P[0].W, h: rec.value.P[0].H }
  const ps = pages.value
  if (!ps.length) return { w: 0, h: 0 }
  return { w: Math.max(...ps.map(p => p.w)), h: ps.reduce((a, p) => a + p.h, 0) + GAP * (ps.length - 1) }
})
const pct = computed(() => Math.min(100, Math.round(((exporting.value && exporting.value.frac) || 0) * 100)))
const stageText = computed(() => {
  const e = exporting.value
  return !e ? '' : e.stage === 'mix' ? '正在混合音频' : e.stage === 'noaudio' ? '此浏览器不支持 AAC，导出的视频将没有声音' : '正在导出 MP4'
})

/* ---------------- 载入 ---------------- */
function disposeAll() {
  els.forEach(a => { a.pause(); a.removeAttribute('src') }); els = []
  pages.value.forEach(p => p.url && URL.revokeObjectURL(p.url)); pages.value = []
  if (rec.value) rec.value.clips.forEach(c => URL.revokeObjectURL(c.url)); rec.value = null
  zip = null; playing.value = false; pos.value = 0; b0 = 0
}
async function load() {
  if (typeof window === 'undefined') return
  const my = ++token
  disposeAll(); kind.value = ''; errMsg.value = ''
  if (!props.source) { phase.value = 'idle'; return }
  phase.value = 'loading'
  try {
    zip = await openSource(props.source, props.fetchOptions)
    const why = props.mode === 'auto' ? await detect(zip) : []
    const isRec = props.mode === 'recording' || (props.mode === 'auto' && why.length > 0)
    if (my !== token) return
    if (isRec) {
      const R = await loadRec(zip)
      if (my !== token) { R.clips.forEach(c => URL.revokeObjectURL(c.url)); return }
      R.clips.forEach(c => { c.t0 = props.audioAnchor === 'segment' ? c.tb : c.ta })
      els = R.clips.map(c => { const a = new Audio(c.url); a.preload = 'auto'; a.muted = isMuted.value; return a })
      rec.value = R; kind.value = 'recording'; cdim.w = R.P[0].W; cdim.h = R.P[0].H
    } else {
      const res = await convert(zip)
      if (my !== token) return
      pages.value = res.map(r => {
        if (r.err) return { err: r.err, w: 600, h: 80 }
        const m = /width="(\d+)" height="(\d+)"/.exec(r.svg.slice(0, 400))
        return { url: URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' })), w: +m[1], h: +m[2], svg: r.svg }
      })
      kind.value = 'static'
    }
    phase.value = 'ready'
    await nextTick(); measure(); fitView(); needDraw = true
    emit('loaded', { kind: kind.value, pages: kind.value === 'static' ? pages.value.length : rec.value.P.length, duration: total.value })
    if (kind.value === 'recording') setPlaying(props.autoplay)
  } catch (e) {
    if (my !== token) return
    phase.value = 'error'; errMsg.value = e && e.message ? e.message : String(e); emit('error', e)
  }
}

/* ---------------- 视图：缩放 / 平移 ---------------- */
function measure() { if (vp.value) { box.w = vp.value.clientWidth; box.h = vp.value.clientHeight } }
function fitView() {
  const c = content.value; if (!c.w || !box.w || !box.h) return
  const multi = kind.value === 'static' && pages.value.length > 1
  fit = multi ? box.w / c.w : Math.min(box.w / c.w, box.h / c.h)
  view.s = fit; view.tx = (box.w - c.w * fit) / 2; view.ty = multi ? 0 : (box.h - c.h * fit) / 2; touched = false
}
function zoomAt(f, cx, cy) {
  const ns = Math.min(Math.max(view.s * f, fit * props.minZoom), fit * props.maxZoom), r = ns / view.s
  view.tx = cx - (cx - view.tx) * r; view.ty = cy - (cy - view.ty) * r; view.s = ns; touched = true
}
const zoomBtn = f => zoomAt(f, box.w / 2, box.h / 2)
const canPan = () => view.s > fit * 1.001 || content.value.h * view.s > box.h + 1

const ptr = new Map(); let lp = null, lpAt = 0
const clearLp = () => { if (lp) { clearTimeout(lp); lp = null } }
function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  vp.value.setPointerCapture && vp.value.setPointerCapture(e.pointerId)
  ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY })
  clearLp()
  if (ptr.size === 1 && e.pointerType !== 'mouse' && props.contextMenu) {
    const x = e.clientX, y = e.clientY
    lp = setTimeout(() => { lp = null; lpAt = Date.now(); openMenu(x, y) }, 550)   // 长按
  }
}
function onMove(e) {
  const p = ptr.get(e.pointerId); if (!p) return
  if (lp && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) clearLp()
  if (ptr.size === 1) {
    view.tx += e.clientX - p.x; view.ty += e.clientY - p.y; touched = true
    p.x = e.clientX; p.y = e.clientY
  } else if (ptr.size === 2) {                                              // 双指缩放
    const [a, b] = [...ptr.values()]
    const oc = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, od = Math.hypot(a.x - b.x, a.y - b.y)
    p.x = e.clientX; p.y = e.clientY
    const nc = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nd = Math.hypot(a.x - b.x, a.y - b.y)
    const r = vp.value.getBoundingClientRect()
    view.tx += nc.x - oc.x; view.ty += nc.y - oc.y
    if (od > 0) zoomAt(nd / od, nc.x - r.left, nc.y - r.top)
  }
}
function onUp(e) { ptr.delete(e.pointerId); clearLp() }
function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {                                             // Ctrl + 滚轮 / 触控板捏合
    e.preventDefault()
    const r = vp.value.getBoundingClientRect()
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), e.clientX - r.left, e.clientY - r.top)
  } else if (canPan()) { e.preventDefault(); view.tx -= e.deltaX; view.ty -= e.deltaY; touched = true }
}
function onCtx(e) { if (props.contextMenu && Date.now() - lpAt > 800) openMenu(e.clientX, e.clientY) }
function openMenu(x, y) {
  if (!props.contextMenu || phase.value !== 'ready') return
  menuPos.value = rectAt(x, y)
  nextTick(() => dd.value && dd.value.handleOpen())
}

/* ---------------- 播放 ---------------- */
const now = () => (playing.value ? b0 + (performance.now() - w0) * rate.value : b0)
function setPlaying(v) {
  if (!rec.value) return
  b0 = now(); w0 = performance.now(); playing.value = v
  if (!v) els.forEach(a => a.pause())
  emit(v ? 'play' : 'pause')
}
function togglePlay() {
  if (!playing.value && b0 >= total.value) b0 = 0
  setPlaying(!playing.value); needDraw = true
}
function seek(ms) { b0 = Math.min(Math.max(ms, 0), total.value); w0 = performance.now(); needDraw = true; els.forEach(a => a.pause()) }
function setRate(r) { b0 = now(); w0 = performance.now(); rate.value = r; els.forEach(a => { a.playbackRate = r }) }
function toggleMute() { isMuted.value = !isMuted.value }
watch(isMuted, v => els.forEach(a => { a.muted = v }))
watch(() => props.muted, v => { isMuted.value = v })
watch(() => props.audioAnchor, v => { if (rec.value) { rec.value.clips.forEach(c => { c.t0 = v === 'segment' ? c.tb : c.ta }); els.forEach(a => a.pause()) } })

function syncAudio(t) {
  const R = rec.value; if (!R) return
  R.clips.forEach((c, i) => {
    const a = els[i], e = (t - c.t0) / 1000
    a.playbackRate = rate.value
    if (playing.value && e >= 0 && (!c.dur || e * 1000 <= c.dur)) {
      if (a.paused) { a.currentTime = e; a.play().catch(() => {}) }       // 被浏览器拦截时，用户首次交互后下一帧会自动重试
      else if (Math.abs(a.currentTime - e) > 0.25) a.currentTime = e
    } else if (!a.paused) a.pause()
  })
}
function tick() {
  raf = requestAnimationFrame(tick)
  const R = rec.value; if (!R || kind.value !== 'recording') return
  let t = now()
  if (playing.value && t >= R.total) {
    if (props.loop) { b0 = 0; w0 = performance.now(); t = 0; els.forEach(a => a.pause()) }
    else { b0 = t = R.total; playing.value = false; els.forEach(a => a.pause()); emit('pause'); emit('ended') }
  }
  if ((playing.value || needDraw) && cv.value) {
    const [p, lt] = pageAt(R, t)
    if (cv.value.width !== p.W || cv.value.height !== p.H) { cv.value.width = p.W; cv.value.height = p.H; cdim.w = p.W; cdim.h = p.H }
    paintPage(cv.value.getContext('2d'), p, lt, 1); needDraw = false
  }
  syncAudio(t)
  if (!seeking) pos.value = t
  if (performance.now() - lastEmit > 250) { lastEmit = performance.now(); emit('timeupdate', t) }
}
const onSeekInput = v => { seeking = true; pos.value = v; seek(v) }
const onSeekChange = v => { seeking = false; seek(v) }

/* ---------------- 导出 ---------------- */
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
async function renderSvg(opts = {}) {
  const list = kind.value === 'static' ? pages.value : await convert(zip)
  const blob = new Blob([mergeSvgs(list)], { type: 'image/svg+xml' })
  if (opts.download) download(blob, `${props.fileName}.svg`)
  return blob
}
async function renderMp4(opts = {}) {
  if (kind.value !== 'recording' || !rec.value) throw Error('只有录制内容可以导出 MP4')
  const q = opts.quality && typeof opts.quality === 'object' ? { key: 'custom', ...opts.quality } : MP4_QUALITY[opts.quality || 'mid']
  if (!q) throw Error('未知画质：' + opts.quality)
  if (exporting.value) throw Error('正在导出')
  const was = playing.value; setPlaying(false)
  const ctl = new AbortController(); abortCtl = ctl
  if (opts.signal) opts.signal.addEventListener('abort', () => ctl.abort())
  exporting.value = { stage: 'encode', frac: 0 }
  try {
    const blob = await encodeMp4(rec.value, q, (stage, frac) => {
      exporting.value = { stage, frac }
      if (stage === 'noaudio') ElMessage.warning('此浏览器不支持 AAC 编码，导出的 MP4 没有声音')
      if (opts.onProgress) opts.onProgress(stage, frac)
    }, ctl.signal)
    if (opts.download) download(blob, `${props.fileName}-${q.key}.mp4`)
    return blob
  } finally { exporting.value = null; abortCtl = null; needDraw = true; if (was) setPlaying(true) }
}
async function saveSvg() {
  try { await renderSvg({ download: true }); ElMessage.success('已保存为 SVG') } catch (e) { ElMessage.error('导出 SVG 失败：' + e.message) }
}
async function saveMp4(q) {
  try { await renderMp4({ quality: q.key, download: true }); ElMessage.success('已保存为 MP4') } catch (e) { if (e.message !== '已取消') ElMessage.error('导出 MP4 失败：' + e.message) }
}
const cancelExport = () => abortCtl && abortCtl.abort()
function onCommand(cmd) {
  if (cmd === 'svg') saveSvg()
  else { const q = QUALITY.find(x => 'mp4:' + x.key === cmd); if (q) saveMp4(q) }
}

/* ---------------- 生命周期 ---------------- */
let ro = null
onMounted(() => {
  ro = new ResizeObserver(() => { measure(); if (!touched) fitView(); needDraw = true })
  vp.value && ro.observe(vp.value)
  tick()
})
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro && ro.disconnect(); cancelExport(); token++; disposeAll() })
watch(() => [props.source, props.mode], load, { immediate: true })

defineExpose({
  zoomIn: () => zoomBtn(1.25), zoomOut: () => zoomBtn(0.8), resetView: fitView,
  play: () => !playing.value && togglePlay(), pause: () => setPlaying(false), toggle: togglePlay,
  seek, setRate, setMuted: v => { isMuted.value = !!v },
  exportSvg: renderSvg, exportMp4: renderMp4
})

/* ---------------- 样式（只用 Element Plus 变量，不输出额外 CSS 文件） ---------------- */
const rootStyle = { position: 'relative', overflow: 'hidden', minHeight: '200px', background: 'var(--el-fill-color-light)' }
const vpStyle = { position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: 'grab' }
const stageStyle = computed(() => ({
  position: 'absolute', left: 0, top: 0, width: content.value.w + 'px', height: content.value.h + 'px',
  transformOrigin: '0 0', transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`
}))
const pageStyle = (p, i) => ({
  display: 'block', width: p.w + 'px', height: p.h + 'px', marginBottom: (i < pages.value.length - 1 ? GAP : 0) + 'px',
  background: '#fff', boxShadow: 'var(--el-box-shadow-light)', pointerEvents: 'none'
})
const floatStyle = {
  position: 'absolute', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px',
  background: 'var(--el-bg-color-overlay)', border: '1px solid var(--el-border-color-lighter)',
  borderRadius: 'var(--el-border-radius-base)', boxShadow: 'var(--el-box-shadow-light)'
}
</script>

<template>
  <div class="ezy-board-viewer" :style="rootStyle">
    <div
      ref="vp" :style="vpStyle"
      @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"
      @wheel="onWheel" @contextmenu.prevent="onCtx"
    >
      <div v-if="phase === 'ready'" :style="stageStyle">
        <template v-if="kind === 'static'">
          <template v-for="(p, i) in pages" :key="i">
            <img v-if="p.url" :src="p.url" :style="pageStyle(p, i)" draggable="false" alt="">
            <ElAlert v-else :title="p.err" type="error" show-icon :closable="false" :style="{ width: p.w + 'px', marginBottom: GAP + 'px' }" />
          </template>
        </template>
        <canvas v-else ref="cv" :style="{ display: 'block', width: cdim.w + 'px', height: cdim.h + 'px', background: '#fff', boxShadow: 'var(--el-box-shadow-light)' }" />
      </div>
    </div>

    <div v-if="phase === 'loading'" :style="{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--el-text-color-secondary)' }">
      <ElIcon class="is-loading" :size="32"><Loading /></ElIcon>
    </div>
    <ElAlert v-if="phase === 'error'" :title="errMsg" type="error" show-icon :closable="false" :style="{ position: 'absolute', left: '12px', right: '12px', top: '12px', width: 'auto' }" />

    <!-- 缩放：右下角 -->
    <ElButtonGroup v-if="phase === 'ready'" :style="{ position: 'absolute', right: '12px', bottom: kind === 'recording' ? '18px' : '12px' }" @pointerdown.stop @contextmenu.stop.prevent>
      <ElButton :icon="ZoomOut" @click="zoomBtn(0.8)" />
      <ElButton :icon="ZoomIn" @click="zoomBtn(1.25)" />
    </ElButtonGroup>

    <!-- 录制：底部浮动控制条 -->
    <div v-if="phase === 'ready' && kind === 'recording'" :style="{ ...floatStyle, left: '12px', right: '112px', bottom: '12px' }" @pointerdown.stop @contextmenu.stop.prevent>
      <ElButton circle :icon="playing ? VideoPause : VideoPlay" @click="togglePlay" />
      <ElSlider :model-value="pos" :min="0" :max="total || 1" :step="1" :format-tooltip="ts" :style="{ flex: 1, margin: '0 8px' }" @input="onSeekInput" @change="onSeekChange" />
      <span :style="{ fontSize: 'var(--el-font-size-small)', color: 'var(--el-text-color-regular)', whiteSpace: 'nowrap' }">{{ ts(pos) }} / {{ ts(total) }}</span>
      <ElButton circle :icon="isMuted ? Mute : Microphone" @click="toggleMute" />
      <ElDropdown trigger="click" @command="setRate">
        <ElButton>{{ rate }}x</ElButton>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem v-for="r in speeds" :key="r" :command="r" :style="r === rate ? { color: 'var(--el-color-primary)' } : null">{{ r }}x</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </div>

    <!-- 导出进度 -->
    <div v-if="exporting" :style="{ ...floatStyle, left: '50%', top: '12px', transform: 'translateX(-50%)', width: 'min(360px, 80%)', flexDirection: 'column', alignItems: 'stretch' }" @pointerdown.stop>
      <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
        <ElProgress :percentage="pct" :stroke-width="10" :style="{ flex: 1 }" />
        <ElButton circle size="small" :icon="Close" @click="cancelExport" />
      </div>
      <span :style="{ fontSize: 'var(--el-font-size-small)', color: 'var(--el-text-color-secondary)' }">{{ stageText }}</span>
    </div>

    <!-- 右键 / 长按菜单 -->
    <ElDropdown v-if="contextMenu" ref="dd" :virtual-ref="trigRef" virtual-triggering trigger="contextmenu" placement="bottom-start" :show-arrow="false" @command="onCommand">
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem command="svg" :icon="Picture">保存为 SVG</ElDropdownItem>
          <template v-if="kind === 'recording'">
            <ElDropdownItem v-for="(q, i) in QUALITY" :key="q.key" :command="'mp4:' + q.key" :icon="VideoCamera" :divided="i === 0">保存为 MP4 · {{ q.label }}</ElDropdownItem>
          </template>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
  </div>
</template>

<template>
  <div class="board-page">
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">画板回复</span>
      <div class="appbar-actions">
        <el-button size="small" :loading="sending" type="primary" :icon="Upload" @click="send">发送</el-button>
      </div>
    </div>

    <div class="board-toolbar">
      <el-button-group>
        <el-button :type="tool === 'select' ? 'primary' : ''" size="small" @click="setTool('select')">选择</el-button>
        <el-button :type="tool === 'draw' ? 'primary' : ''" size="small" @click="setTool('draw')">画笔</el-button>
        <el-button :type="tool === 'text' ? 'primary' : ''" size="small" @click="setTool('text')">文字</el-button>
        <el-button size="small" @click="pickImage">图片</el-button>
      </el-button-group>

      <div class="swatches">
        <span
          v-for="c in colors"
          :key="c"
          class="swatch"
          :class="{ active: currentColor === c }"
          :style="{ background: c }"
          @click="setColor(c)"
        />
      </div>

      <el-button-group>
        <el-button size="small" @click="undo">撤销</el-button>
        <el-button size="small" @click="redo">重做</el-button>
        <el-button size="small" type="danger" plain @click="clearAll">清空</el-button>
      </el-button-group>

      <div class="zoom">
        <el-button size="small" circle @click="zoomOut">−</el-button>
        <span class="zoom-label">{{ Math.round(zoomLevel * 100) }}%</span>
        <el-button size="small" circle @click="zoomIn">+</el-button>
      </div>

      <input ref="imgInput" type="file" accept="image/*" class="hidden-input" @change="onImgChange" />
    </div>

    <div class="board-wrap" ref="wrapRef">
      <div class="canvas-inner" :style="innerStyle">
        <canvas ref="canvasRef"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fabric } from 'fabric'
import JSZip from 'jszip'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Upload } from '@element-plus/icons-vue'
import { proxyImgSrc } from '@/utils/proxy'

const CANVAS_W = 2200
const CANVAS_H = 1395
const colors = ['#000000', '#FFFFFF', '#FF0000', '#0000FF', '#00AA00', '#FFFF00', '#FF8800', '#8800CC', '#888888', '#FF69B4']

const route = useRoute()
const router = useRouter()
const sessionId = String(route.params.sessionId || '')

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const imgInput = ref<HTMLInputElement | null>(null)
const tool = ref<'select' | 'draw' | 'text'>('select')
const currentColor = ref('#000000')
const currentWidth = ref(3)
const zoomLevel = ref(1)
const sending = ref(false)
const innerStyle = reactive({ width: '0px', height: '0px' })

let fc: InstanceType<typeof fabric.Canvas> | null = null
let undoStack: string[] = []
let redoStack: string[] = []
const MAX_HISTORY = 50

function applyZoom() {
  if (!fc) return
  const z = zoomLevel.value
  fc.setZoom(z)
  // 仅缩放 canvas 的“显示尺寸”（cssOnly），逻辑坐标系仍保持 2200×1395，
  // 否则 canvas 元素始终以原始 2200×1395 像素显示，会比阴影框大一圈、能画到框外。
  // 注意 cssOnly 模式下不会自动补 px，必须传带单位的字符串。
  fc.setDimensions({ width: CANVAS_W * z + 'px', height: CANVAS_H * z + 'px' }, { cssOnly: true })
  innerStyle.width = CANVAS_W * z + 'px'
  innerStyle.height = CANVAS_H * z + 'px'
}
function fitZoom() {
  const wrap = wrapRef.value
  if (!wrap) return
  const pad = 24
  const maxW = wrap.clientWidth - pad
  const maxH = wrap.clientHeight - pad
  zoomLevel.value = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1)
  applyZoom()
}

function saveState() {
  if (!fc) return
  undoStack.push(JSON.stringify(fc.toJSON(['id'])))
  if (undoStack.length > MAX_HISTORY) undoStack.shift()
  redoStack = []
}
function undo() {
  if (!fc || undoStack.length < 2) return
  undoStack.pop()
  const prev = undoStack[undoStack.length - 1]
  fc.loadFromJSON(prev, () => fc!.renderAll())
}
function redo() {
  if (!fc || redoStack.length === 0) return
  const next = redoStack.pop()!
  undoStack.push(next)
  fc.loadFromJSON(next, () => fc!.renderAll())
}
function clearAll() {
  if (!fc) return
  fc.clear()
  fc.backgroundColor = '#FFFFFF'
  fc.renderAll()
  undoStack = []
  redoStack = []
  saveState()
}

function setTool(t: 'select' | 'draw' | 'text') {
  if (!fc) return
  tool.value = t
  fc.isDrawingMode = false
  fc.selection = true
  if (t === 'draw') {
    fc.isDrawingMode = true
    fc.freeDrawingBrush && ((fc.freeDrawingBrush as any).color = currentColor.value)
    fc.freeDrawingBrush && ((fc.freeDrawingBrush as any).width = currentWidth.value)
    fc.selection = false
  } else if (t === 'text') {
    const tb = new fabric.Textbox('双击输入文字', {
      left: CANVAS_W / 2 - 150,
      top: CANVAS_H / 2 - 20,
      width: 300,
      fontSize: 40,
      fill: currentColor.value,
      fontFamily: 'sans-serif'
    })
    fc.add(tb)
    fc.setActiveObject(tb)
    tb.enterEditing()
    tb.selectAll()
    saveState()
    setTool('select')
  }
}
function setColor(c: string) {
  currentColor.value = c
  if (fc && fc.isDrawingMode && fc.freeDrawingBrush) {
    ;(fc.freeDrawingBrush as any).color = c
  }
  const active = fc?.getActiveObject()
  if (active) {
    if ((active as any).type === 'textbox' || (active as any).type === 'i-text') {
      ;(active as any).set('fill', c)
    } else if ((active as any).stroke !== undefined) {
      ;(active as any).set('stroke', c)
    }
    fc!.renderAll()
  }
}
function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value + 0.1, 3)
  applyZoom()
}
function zoomOut() {
  zoomLevel.value = Math.max(zoomLevel.value - 0.1, 0.2)
  applyZoom()
}
function pickImage() {
  imgInput.value?.click()
}
function insertImage(dataUrl: string) {
  if (!fc) return
  fabric.Image.fromURL(dataUrl, (img) => {
    const maxW = CANVAS_W * 0.8
    const maxH = CANVAS_H * 0.8
    if (img.width! > maxW || img.height! > maxH) {
      const ratio = Math.min(maxW / img.width!, maxH / img.height!)
      img.scale(ratio)
    }
    img.set({ left: CANVAS_W / 2 - (img.width! * img.scaleX!) / 2, top: CANVAS_H / 2 - (img.height! * img.scaleY!) / 2 })
    fc!.add(img)
    fc!.setActiveObject(img)
    saveState()
  })
}
function onImgChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => insertImage(ev.target!.result as string)
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function send() {
  if (!fc) return
  sending.value = true
  try {
    const prevZoom = zoomLevel.value
    zoomLevel.value = 1
    applyZoom()
    const jpgUrl = fc.toDataURL({ format: 'jpeg', quality: 0.92, multiplier: 1, width: CANVAS_W, height: CANVAS_H })
    const pngUrl = fc.toDataURL({ format: 'png', multiplier: 1, width: CANVAS_W, height: CANVAS_H })
    zoomLevel.value = prevZoom
    applyZoom()

    const jpgBlob = await (await fetch(jpgUrl)).blob()
    const pngBlob = await (await fetch(pngUrl)).blob()

    const { uploadFile, fetchUserId } = await import('@/utils/oss')
    const uid = await fetchUserId()

    const zipResp = await fetch('blackbroad.zip')
    if (!zipResp.ok) throw new Error('下载 blackbroad.zip 模板失败')
    const zip = await JSZip.loadAsync(await zipResp.arrayBuffer())
    const targetPath = 'res/image/7769755f-f199-4371-a655-63ea2edcf153.jpg'
    if (!zip.file(targetPath)) throw new Error('ZIP 模板中找不到目标文件')
    zip.file(targetPath, jpgBlob, { binary: true })
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })

    const { addMessage } = await import('@/api/quora')
    const zipUrl = await uploadFile(zipBlob, uid, 'quora_v2', '', `blackbroad_${Date.now()}.zip`)
    const pngUrl2 = await uploadFile(pngBlob, uid, 'quora_v2', '', `snapshot_${Date.now()}.png`)

    await addMessage(zipUrl, sessionId, pngUrl2)
    ElMessage.success('发送成功')
    // 用 replace 跳回详情页：把画板路由自身替换为详情，避免返回时又回到画板
    router.replace(`/quora/${sessionId}`)
  } catch (e: any) {
    ElMessage.error('发送失败：' + (e.message || e))
  } finally {
    sending.value = false
  }
}

function goBack() {
  router.push(`/quora/${sessionId}`)
}

function initCanvas() {
  if (!canvasRef.value || fc) return
  fc = new fabric.Canvas(canvasRef.value, {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#ffffff',
    selection: true,
    preserveObjectStacking: true
  })
  fc.on('object:modified', saveState)
  fc.on('path:created', saveState)
  setTool('select')
  fitZoom()
  saveState()

  // 插入从详情页带来的问题截图
  const pending = route.query.img ? String(route.query.img) : ''
  if (pending) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const off = document.createElement('canvas')
      off.width = img.naturalWidth
      off.height = img.naturalHeight
      off.getContext('2d')!.drawImage(img, 0, 0)
      insertImage(off.toDataURL())
    }
    img.onerror = () => console.error('插入问题截图失败')
    img.src = pending
  }
}

let ro: ResizeObserver | null = null
onMounted(async () => {
  await nextTick()
  initCanvas()
  await nextTick()
  fitZoom()
  if (wrapRef.value) {
    ro = new ResizeObserver(() => fitZoom())
    ro.observe(wrapRef.value)
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  fc?.dispose()
  fc = null
})
</script>

<style scoped>
.board-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.appbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  flex-shrink: 0;
}
.appbar .back {
  font-size: 20px;
  cursor: pointer;
}
.appbar-title {
  font-weight: 600;
  font-size: 16px;
}
.appbar-actions {
  margin-left: auto;
}
.board-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}
.swatches {
  display: flex;
  gap: 4px;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #555;
  cursor: pointer;
}
.swatch.active {
  border-color: #fff;
  box-shadow: 0 0 6px 2px rgba(0, 0, 0, 0.4);
}
.zoom {
  display: flex;
  align-items: center;
  gap: 6px;
}
.zoom-label {
  min-width: 3em;
  text-align: center;
  font-size: 13px;
}
.hidden-input {
  display: none;
}
.board-wrap {
  flex: 1 1 auto;
  width: 100%;
  overflow: auto;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  min-height: 0;
}
.canvas-inner {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
}
</style>

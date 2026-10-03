<template>
  <div class="note-detail">
    <!-- 顶部返回栏（参考 Gblox 帖子详情 appbar） -->
    <div class="appbar">
      <el-icon class="back" @click="goBack"><ArrowLeft /></el-icon>
      <span class="appbar-title">{{ fileName || '笔记预览' }}</span>
      <!-- 桌面端：纯图标按钮 -->
      <template v-if="!isMobile">
        <el-dropdown trigger="click" @command="setRenderer">
          <el-button :title="renderer === 'hd' ? '当前：高清渲染器' : '当前：传统渲染器'">
            <el-icon><Picture /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="classic" :disabled="renderer === 'classic'">切换到传统渲染器</el-dropdown-item>
              <el-dropdown-item command="hd" :disabled="renderer === 'hd'">切换到高清渲染器</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="success" :loading="exporting" @click="exportPdf">
          <el-icon><Document /></el-icon>
        </el-button>
        <el-button type="info" :loading="downloading" @click="downloadZip">
          <el-icon><Download /></el-icon>
        </el-button>
      </template>
      <!-- 移动端：三个点按钮 + 底部弹出面板（带遮罩，参考 Gblox） -->
      <template v-else>
        <button type="button" class="more-btn" @click="showSheet = true">
          <el-icon><MoreFilled /></el-icon>
        </button>
        <Teleport to="body">
          <div v-if="showSheet" class="actions-mask" @click="showSheet = false" />
          <div v-if="showSheet" class="actions-sheet">
            <div class="actions-item" @click="onActionCommand('pdf')">
              <el-icon><Document /></el-icon><span>导出为PDF</span>
            </div>
            <div class="actions-item" @click="onActionCommand('zip')">
              <el-icon><Download /></el-icon><span>下载笔记</span>
            </div>
            <div class="actions-item" @click="onActionCommand('renderer')">
              <el-icon><Picture /></el-icon>
              <span>{{ renderer === 'hd' ? '切换到传统渲染器' : '切换到高清渲染器' }}</span>
            </div>
            <div class="actions-cancel" @click="showSheet = false">取消</div>
          </div>
        </Teleport>
      </template>
    </div>

    <div v-loading="loading" class="preview-body">
      <el-empty v-if="!loading && pages.length === 0" description="该笔记没有可预览的内容" />
      <div v-else-if="currentPageData" class="page-content">
        <!-- 页面总览：传统渲染器直接显示笔记截图，高清渲染器渲染真实画板 -->
        <div class="thumb-wrap">
          <el-image
            v-if="renderer === 'classic'"
            :src="currentPageData.thumbnail?.imgSrc"
            :preview-src-list="currentPageData.thumbnail ? [currentPageData.thumbnail.imgSrc] : []"
            :initial-index="0"
            fit="contain"
            class="thumb-img"
            preview-teleported
            hide-on-click-modal
          >
            <template #error>
              <div class="img-error">
                <el-icon><PictureFilled /></el-icon>
                <span>总览图加载失败</span>
              </div>
            </template>
          </el-image>
          <EzyBoardViewer
            v-else-if="boardSource"
            :source="boardSource"
            :file-name="`${fileName || 'note'}-${currentPage}`"
            class="thumb-board"
          />
          <div v-else class="img-error">
            <el-icon><Loading /></el-icon>
            <span>{{ boardLoading ? '正在渲染画板…' : boardError || '该页没有可渲染的画板' }}</span>
          </div>
        </div>

        <!-- 页内插入的图片（水平滚动） -->
        <div v-if="currentPageData.originals.length" class="originals-block">
          <div class="originals-label">页内图片（{{ currentPageData.originals.length }}）</div>
          <div class="originals-row">
            <el-image
              v-for="(orig, i) in currentPageData.originals"
              :key="orig.imgSrc"
              :src="orig.imgSrc"
              :preview-src-list="originalPreviewList"
              :initial-index="i"
              fit="contain"
              class="orig-img"
              preview-teleported
              hide-on-click-modal
            >
              <template #error>
                <div class="img-error small">
                  <el-icon><PictureFilled /></el-icon>
                </div>
              </template>
            </el-image>
          </div>
        </div>
      </div>
    </div>

    <div v-if="pages.length" class="pager-bar">
      <el-button :disabled="currentPage <= 1" @click="currentPage--">
        <el-icon><ArrowLeft /></el-icon>
        <span v-if="!isMobile">上一页</span>
      </el-button>
      <el-input-number
        v-model="currentPage"
        :min="1"
        :max="pages.length"
        controls-position="right"
        class="page-input"
      />
      <span class="page-info">
        / {{ pages.length }} 页（第 {{ pages[currentPage - 1] }} 页）
      </span>
      <el-button :disabled="currentPage >= pages.length" @click="currentPage++">
        <span v-if="!isMobile">下一页</span>
        <el-icon><ArrowRight /></el-icon>
      </el-button>
    </div>

    <el-dialog
      v-model="progressVisible"
      title="处理中"
      width="360px"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <div class="progress-text">{{ progressText }}</div>
      <el-progress :percentage="progressPercent" :stroke-width="16" />
      <div v-if="isMobile" class="progress-hint">手机版导出用时可能较长，请耐心等待</div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Document, Download, Picture, PictureFilled, MoreFilled, Loading } from '@element-plus/icons-vue'
import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import { EzyBoardViewer, type BoardFile } from 'ezy-board-viewer'
import { getNoteResources, getNoteResourcesForZip, type NoteResource } from '@/api/note'
import { proxyUrl, proxyImgSrc, resourceFetchUrl } from '@/utils/proxy'
import { saveBlobFile } from '@/utils/saveFile'
import { formatError, logError } from '@/utils/errorText'
import { useIsMobile } from '@/composables/useIsMobile'

const { isMobile } = useIsMobile()

const OSS_BASE = 'http://friday-note.oss-cn-hangzhou.aliyuncs.com/'
const PDF_FOOTER = 'https://github.com/Loshop-Studio/ZhongYuToolBox_Web'
/** 仅图片资源可渲染，模板 .bin 等需过滤 */
const IMG_EXT_RE = /\.(jpg|jpeg|png|webp|gif|bmp)$/i

interface ResEntry {
  url: string
  imgSrc: string
  /** 原始 OSS 地址（用于 fetch 读数据，再经 resourceFetchUrl 决定直连/代理） */
  raw: string
  ext: string
}
interface PageData {
  thumbnail?: ResEntry
  originals: ResEntry[]
}

const route = useRoute()
const router = useRouter()

const fileId = computed(() => String(route.params.fileId || ''))
const fileName = computed(() => String(route.query.name || ''))

const loading = ref(false)
const exporting = ref(false)
const downloading = ref(false)
const showSheet = ref(false)
const progressVisible = ref(false)
const progressPercent = ref(0)
const progressText = ref('')

const pageMap = ref<Record<number, PageData>>({})
const pages = ref<number[]>([])
const currentPage = ref(1)

const currentPageData = computed(() => pageMap.value[pages.value[currentPage.value - 1]])

/** 当前页所有插入图片的地址，供大图预览切换 */
const originalPreviewList = computed(() =>
  (currentPageData.value?.originals || []).map((o) => o.imgSrc)
)

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/note')
}

/** 移动端底部面板命令分发 */
function onActionCommand(cmd: string) {
  showSheet.value = false
  if (cmd === 'pdf') exportPdf()
  else if (cmd === 'zip') downloadZip()
  else if (cmd === 'renderer') setRenderer(renderer.value === 'hd' ? 'classic' : 'hd')
}

/** 资源绝对地址 */
function fullUrl(item: NoteResource): string {
  return item.ossImageUrl.startsWith('http') ? item.ossImageUrl : OSS_BASE + item.ossImageUrl
}

/** 资源地址转换（复刻 noteDownload 中 ossImageUrl 处理） */
function toEntry(item: NoteResource): ResEntry {
  const full = fullUrl(item)
  return {
    url: proxyUrl(full),
    imgSrc: proxyImgSrc(full),
    raw: full,
    ext: item.ossImageUrl.split('.').pop() || ''
  }
}

/* ===== 渲染器：高清 = 渲染画板，传统 = 直接展示截图 ===== */
const renderer = ref<'hd' | 'classic'>('hd')
function setRenderer(v: 'hd' | 'classic') {
  renderer.value = v
  // 传统模式下翻页不会更新 boardSource，切回高清时按当前页重新组装
  if (v === 'hd') loadBoard()
}

/* ===== 画板渲染：用 ezy-board-viewer 的文件列表形式 ===== */
/** 每页的画板数据：snapshot.bin（渲染用）+ 同名 screenshot（取画布尺寸） */
const pageBoards = ref<Record<number, { snapshot: string; screenshot: string }>>({})
/** res/image 下的图片资源，多页共享 */
const sharedImages = ref<NoteResource[]>([])
const imageFiles = ref<BoardFile[] | null>(null)
const boardSource = ref<BoardFile[] | null>(null)
const boardLoading = ref(false)
const boardError = ref('')

/** 下载资源（走代理或直连） */
async function fetchResourceBlob(url: string): Promise<Blob> {
  const res = await fetch(resourceFetchUrl(url))
  if (!res.ok) throw new Error('资源下载失败：HTTP ' + res.status)
  return await res.blob()
}

/**
 * 合成最小 header.bin（protobuf：field 2 = 宽、field 3 = 高，均为 varint）。
 * 云笔记的 Resources/GetByFileId 不会返回 header.bin，而 ezy-board-viewer 渲染每页时必须有它。
 */
function makeHeaderBlob(width: number, height: number): Blob {
  const bytes: number[] = []
  const vi = (v: number) => {
    let x = v >>> 0
    while (x > 0x7f) { bytes.push((x & 0x7f) | 0x80); x >>>= 7 }
    bytes.push(x)
  }
  vi(0x10); vi(width)
  vi(0x18); vi(height)
  return new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })
}

/** res/image 多页共享，整篇笔记只下一次 */
async function ensureImageFiles(): Promise<BoardFile[]> {
  if (imageFiles.value) return imageFiles.value
  imageFiles.value = await Promise.all(sharedImages.value.map(async (item) => ({
    path: 'res/image/' + (item.ossImageUrl.split('/').pop() || item.ossImageUrl),
    blob: await fetchResourceBlob(fullUrl(item))
  })))
  return imageFiles.value
}

/** 组装某一页的文件列表：该页 header.bin / snapshot.bin + 共享图片 */
async function buildBoardSource(pageKey: number): Promise<BoardFile[]> {
  const b = pageBoards.value[pageKey]
  if (!b?.snapshot) throw new Error('该页缺少 snapshot.bin，无法渲染')
  const [snapshot, images] = await Promise.all([fetchResourceBlob(b.snapshot), ensureImageFiles()])
  // 画布尺寸取该页截图的像素尺寸，保证渲染结果与 App 截图同比例
  let width = 1080, height = 1920
  if (b.screenshot) {
    try {
      const bmp = await createImageBitmap(await fetchResourceBlob(b.screenshot))
      if (bmp.width > 1 && bmp.height > 1) { width = bmp.width; height = bmp.height }
      bmp.close()
    } catch {
      // 取不到尺寸就按默认画布渲染
    }
  }
  const dir = pageKey + '/'
  return [
    { path: dir + 'header.bin', blob: makeHeaderBlob(width, height) },
    { path: dir + 'snapshot.bin', blob: snapshot },
    ...images
  ]
}

/** 载入当前页的画板 */
async function loadBoard() {
  const pageKey = pages.value[currentPage.value - 1]
  boardSource.value = null
  boardError.value = ''
  if (pageKey == null) return
  if (!pageBoards.value[pageKey]?.snapshot) {
    boardError.value = '该页没有可用的画板数据'
    return
  }
  boardLoading.value = true
  try {
    boardSource.value = await buildBoardSource(pageKey)
  } catch (e: any) {
    boardError.value = formatError(e)
  } finally {
    boardLoading.value = false
  }
}

async function loadResources() {
  if (!fileId.value) return
  loading.value = true
  pageMap.value = {}
  pages.value = []
  currentPage.value = 1
  // 切换笔记时，上一次的共享图片缓存与渲染结果都要失效
  imageFiles.value = null
  pageBoards.value = {}
  sharedImages.value = []
  boardSource.value = null
  boardError.value = ''
  try {
    const list = await getNoteResources(fileId.value)
    const map: Record<number, PageData> = {}
    for (const item of list) {
      const page = item.pageIndex + 1
      if (item.resourceType === 1) {
        // 画板数据：snapshot.bin 交给 ezy-board-viewer 渲染；
        // data.mdb / lock.mdb 是 App 自己的增量库，查看器不需要
        if (/snapshot\.bin$/i.test(item.ossImageUrl)) {
          if (!pageBoards.value[page]) pageBoards.value[page] = { snapshot: '', screenshot: '' }
          pageBoards.value[page].snapshot = fullUrl(item)
          // 只画了一个形状、没有图片资源的页也要能预览
          if (!map[page]) map[page] = { originals: [] }
        }
        continue
      }
      // 过滤其他模板 bin 等非图片资源
      if (!IMG_EXT_RE.test(item.ossImageUrl)) continue
      if (!map[page]) map[page] = { originals: [] }
      if (item.resourceType === 2) {
        // resourceType 2 为页面总览截图
        map[page].thumbnail = toEntry(item)
        // 截图尺寸就是画布尺寸，用它合成渲染所需的 header.bin
        if (!pageBoards.value[page]) pageBoards.value[page] = { snapshot: '', screenshot: '' }
        pageBoards.value[page].screenshot = fullUrl(item)
      } else {
        // 其余为页内插入的图片
        map[page].originals.push(toEntry(item))
        if (item.resourceType === 0) sharedImages.value.push(item)
      }
    }
    pageMap.value = map
    // 优先按"有画板数据的页"翻页，没有时退回原来的"有图片的页"
    const boardPages = Object.keys(pageBoards.value).map(Number).sort((a, b) => a - b)
    pages.value = boardPages.length
      ? boardPages
      : Object.keys(map).map(Number).sort((a, b) => a - b)
  } catch (e: any) {
    ElMessage.error(e.message || '加载笔记失败')
  } finally {
    loading.value = false
  }
  // 传统渲染器只看截图，不必去拉画板资源
  if (renderer.value === 'hd') await loadBoard()
}

/** 图片转 DataURL（复刻 loadImageAsDataURL） */
async function loadImageAsDataURL(url: string): Promise<string> {
  const res = await fetch(resourceFetchUrl(url))
  const blob = await res.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

/** 导出 PDF（复刻 exportPdfBtn 逻辑） */
async function exportPdf() {
  if (pages.value.length === 0) return
  exporting.value = true
  progressVisible.value = true
  progressText.value = '正在导出 PDF...'
  progressPercent.value = 0
  try {
    const pdf = new jsPDF('p', 'pt', 'a4')
    let added = 0
    for (let i = 0; i < pages.value.length; i++) {
      const pageData = pageMap.value[pages.value[i]]
      if (!pageData?.thumbnail) continue

      const img = await loadImageAsDataURL(pageData.thumbnail.raw)
      const imgObj = new Image()
      imgObj.src = img
      await new Promise((r) => {
        imgObj.onload = r
      })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const ratio = Math.min(pageWidth / imgObj.width, pageHeight / imgObj.height)
      const imgWidth = imgObj.width * ratio
      const imgHeight = imgObj.height * ratio
      const x = (pageWidth - imgWidth) / 2
      const y = (pageHeight - imgHeight) / 2

      if (added > 0) pdf.addPage()
      pdf.addImage(img, 'JPEG', x, y, imgWidth, imgHeight)
      added++

      pdf.setFontSize(8)
      pdf.setTextColor(100)
      const textWidth = pdf.getTextWidth(PDF_FOOTER)
      pdf.text(PDF_FOOTER, pageWidth - textWidth - 20, pageHeight - 20)

      progressPercent.value = Math.round(((i + 1) / pages.value.length) * 100)
    }
    const pdfBlob = pdf.output('blob')
    await saveBlobFile(pdfBlob, (fileName.value || 'note') + '.pdf')
    ElMessage.success('PDF 导出完成')
  } catch (e: any) {
    logError('exportPdf', e)
    ElMessage.error('导出 PDF 失败：' + formatError(e))
  } finally {
    progressVisible.value = false
    exporting.value = false
  }
}

/** 打包下载 zip（复刻 noteDownload2） */
async function downloadZip() {
  downloading.value = true
  progressVisible.value = true
  progressText.value = '正在获取笔记图片...'
  progressPercent.value = 0
  try {
    const list = await getNoteResourcesForZip(fileId.value)
    const zip = new JSZip()
    const count: Record<number, number> = {}

    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      const full = item.ossImageUrl.startsWith('http') ? item.ossImageUrl : OSS_BASE + item.ossImageUrl
      const url = resourceFetchUrl(full)
      progressPercent.value = Math.round(((i + 1) / list.length) * 100)
      if (/\.(jpg|jpeg|png|webp)$/.test(url)) {
        const image = await fetch(url).then((r) => r.blob())
        if (!count[item.pageIndex]) count[item.pageIndex] = 1
        const suffix = item.resourceType === 2 ? 'thumbnail' : count[item.pageIndex]++
        zip.file(`${item.pageIndex + 1}-${suffix}.jpg`, image)
      }
    }

    progressText.value = '正在打包...'
    const content = await zip.generateAsync({ type: 'blob' })
    await saveBlobFile(content, fileName.value + '.zip')
    ElMessage.success('下载已启动')
  } catch (e: any) {
    ElMessage.error(e.message || '下载失败')
  } finally {
    progressVisible.value = false
    downloading.value = false
  }
}

onMounted(loadResources)
// keep-alive 会复用同一组件实例，切换不同笔记文件时需重新加载
watch(
  () => [route.params.fileId, route.query.name],
  () => loadResources()
)
// 翻页时渲染对应页的画板
watch(currentPage, () => {
  if (renderer.value === 'hd') loadBoard()
})
</script>

<style scoped>
.note-detail {
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
/* 顶部 sticky 返回栏（参考 Gblox 帖子详情 appbar） */
.appbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 16px;
  margin-bottom: 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}
.appbar .back {
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
  color: var(--el-text-color-regular);
}
.appbar-title {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 三个点按钮：无背景、黑色图标（参考 Gblox ContentActionsMenu） */
.more-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--el-text-color-primary);
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 50%;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}
.more-btn:hover {
  background: var(--el-fill-color-light);
}
/* 移动端底部弹出面板（带遮罩） */
.actions-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
}
.actions-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2001;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
  background: var(--el-bg-color);
  border-top-left-radius: 14px;
  border-top-right-radius: 14px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.12);
}
.actions-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 20px;
  font-size: 16px;
  color: var(--el-text-color-primary);
  cursor: pointer;
}
.actions-item:active {
  background: var(--el-fill-color-light);
}
.actions-cancel {
  margin-top: 6px;
  padding: 15px 20px;
  text-align: center;
  font-size: 16px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
}
.preview-body {
  flex: 1 1 auto;
  min-height: 60vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
}
.page-content {
  width: 100%;
  display: flex;
  flex-direction: column;
}
/* 页面总览：居中 */
.thumb-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}
/* 传统渲染器：截图大图，完整显示不裁剪 */
.thumb-img {
  max-width: 100%;
  box-shadow: 0 2px 8px #ccc;
  border-radius: 4px;
  cursor: zoom-in;
}
/* el-image 内部 img 需显式约束，否则会溢出容器 */
.thumb-img :deep(img) {
  display: block;
  width: auto;
  height: auto;
  object-fit: contain;
  max-width: 100%;
  max-height: calc(100vh - 300px);
  min-height: 320px;
}
/* 高清渲染器：画板需要显式高度，否则只有组件自带的最小高度 */
.thumb-board {
  width: 100%;
  height: calc(100vh - 280px);
  min-height: 320px;
  border-radius: 4px;
  box-shadow: 0 2px 8px #ccc;
}
/* 页内插入图片：水平滚动小图 */
.originals-block {
  width: 100%;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
.originals-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.originals-row {
  width: 100%;
  overflow-x: auto;
  white-space: nowrap;
  display: flex;
  gap: 16px;
  padding-bottom: 8px;
}
.orig-img {
  flex: 0 0 auto;
  height: 120px;
  max-width: 180px;
  border-radius: 4px;
  box-shadow: 0 1px 4px #bbb;
  cursor: zoom-in;
}
.img-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  min-height: 120px;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.img-error.small {
  min-height: 120px;
  width: 120px;
}
.pager-bar {
  position: sticky;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
}
.page-input {
  width: 110px;
}
.page-info {
  color: var(--el-text-color-secondary);
}
.progress-text {
  margin-bottom: 12px;
}
.progress-hint {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

/* ===== 移动端适配 ===== */
@media (max-width: 767px) {
  .note-detail {
    padding: 0;
  }
  /* 顶栏通栏（content 已 flush） */
  .appbar {
    margin-bottom: 8px;
    padding: 0 10px;
  }
  .preview-body {
    border-radius: 6px;
    padding: 8px;
  }
  .thumb-board {
    height: 60vh;
    min-height: 260px;
  }
  .pager-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    justify-content: space-around;
    border-radius: 0;
    padding: 8px 10px;
    gap: 6px;
    background: var(--el-bg-color);
    border-top: 1px solid var(--el-border-color-light);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  }
  /* 预览区底部留出翻页栏高度，避免内容被遮挡 */
  .preview-body {
    margin-bottom: 60px;
  }
  .page-input {
    width: 90px;
  }
  .page-info {
    font-size: 12px;
  }
}
</style>

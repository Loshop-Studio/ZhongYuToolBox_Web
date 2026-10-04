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
        <el-button
          type="success"
          :loading="exporting"
          :title="renderer === 'hd' ? '导出高清 PDF（矢量）' : '导出 PDF（页面截图）'"
          @click="exportPdf"
        >
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
              <el-icon><Document /></el-icon>
              <span>{{ renderer === 'hd' ? '导出为PDF（高清矢量）' : '导出为PDF（图片）' }}</span>
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

    <div v-loading="loading" class="preview-body" :class="{ 'preview-body--hd': renderer === 'hd' }">
      <el-empty v-if="!loading && pages.length === 0" description="该笔记没有可预览的内容" />
      <div v-else-if="currentPageData" class="page-content" :class="{ 'page-content--hd': renderer === 'hd' }">
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
          <NoteViewer
            v-else-if="vfs"
            ref="noteViewerRef"
            :source="vfs"
            :initial-page="currentPage"
            :show-pages="false"
            :show-meta="false"
            :file-name="fileName || 'note'"
            :context-menu="false"
            class="thumb-board"
            @pagechange="onPageChange"
            @error="onViewerError"
          />
          <div v-else class="img-error">
            <el-icon><Loading /></el-icon>
            <span>{{ loading ? '正在加载笔记…' : viewerError || '该笔记没有可渲染的画板' }}</span>
          </div>
        </div>

        <!-- 页内插入的图片（水平滚动）：仅传统渲染器需要，高清画板里已包含这些内容 -->
        <div v-if="renderer === 'classic' && currentPageData.originals.length" class="originals-block">
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
      <el-button :disabled="currentPage <= 1" @click="gotoPage(currentPage - 1)">
        <el-icon><ArrowLeft /></el-icon>
        <span v-if="!isMobile">上一页</span>
      </el-button>
      <el-input-number
        :model-value="currentPage"
        :min="1"
        :max="pages.length"
        controls-position="right"
        class="page-input"
        @change="gotoPage"
      />
      <span class="page-info">
        / {{ pages.length }} 页（第 {{ pages[currentPage - 1] }} 页）
      </span>
      <el-button :disabled="currentPage >= pages.length" @click="gotoPage(currentPage + 1)">
        <span v-if="!isMobile">下一页</span>
        <el-icon><ArrowRight /></el-icon>
      </el-button>
    </div>

    <!-- 首次进入笔记预览：引导选择渲染方式（结果记入本地存储，之后可在右上角随时切换） -->
    <el-dialog
      v-model="rendererPickerVisible"
      title="选择笔记渲染方式"
      :width="isMobile ? '92%' : '640px'"
      align-center
      class="renderer-picker"
      @close="markRendererAsked"
    >
      <div class="renderer-options">
        <button type="button" class="renderer-card" @click="chooseRenderer('classic')">
          <span class="renderer-card-head">
            <el-icon class="renderer-card-icon"><Picture /></el-icon>
            <span class="renderer-card-titles">
              <span class="renderer-card-title">传统渲染</span>
              <span class="renderer-card-sub">页面截图</span>
            </span>
          </span>
          <span class="renderer-card-list">
            <span class="renderer-card-item">秒开，不必先解析画板数据</span>
            <span class="renderer-card-item">与手机端看到的画面完全一致</span>
            <span class="renderer-card-item">占用更低，老设备更流畅</span>
          </span>
        </button>

        <button type="button" class="renderer-card" @click="chooseRenderer('hd')">
          <span class="renderer-card-badge">默认</span>
          <span class="renderer-card-head">
            <el-icon class="renderer-card-icon"><PictureFilled /></el-icon>
            <span class="renderer-card-titles">
              <span class="renderer-card-title">高清渲染</span>
              <span class="renderer-card-sub">矢量画板</span>
            </span>
          </span>
          <span class="renderer-card-list">
            <span class="renderer-card-item">矢量重建笔迹，放大也不发虚</span>
            <span class="renderer-card-item">可导出高清矢量 PDF</span>
            <span class="renderer-card-item">笔迹、文字、图片完整还原</span>
          </span>
        </button>
      </div>

      <div class="renderer-hint">
        <el-icon><InfoFilled /></el-icon>
        <span>
          {{
            isMobile
              ? '以后可在预览页右上角「⋯」菜单里随时切换'
              : '以后可在预览页右上角的「图片」按钮里随时切换'
          }}
        </span>
      </div>
    </el-dialog>

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
import { ref, shallowRef, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Document, Download, Picture, PictureFilled, MoreFilled, Loading, InfoFilled } from '@element-plus/icons-vue'
import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import {
  NoteViewer, createNoteVfs, drawSvgToPdf,
  type NoteViewerInstance, type NoteVfs, type NotePage, type NoteImage
} from 'ezy-board-viewer'
import { getNoteResources, getNoteResourcesForZip, type NoteResource } from '@/api/note'
import { proxyUrl, proxyImgSrc, resourceFetchUrl } from '@/utils/proxy'
import { saveBlobFile } from '@/utils/saveFile'
import { ensureCjkPdfFont } from '@/utils/pdfFont'
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

/* ===== 渲染器：高清 = NoteViewer（画板），传统 = 截图 ===== */
/** 渲染器偏好：首次进入时引导选择一次，结果记入本地存储 */
const RENDERER_KEY = 'noteRenderer'
const RENDERER_ASKED_KEY = 'noteRendererAsked'

function readStoredRenderer(): 'hd' | 'classic' | null {
  try {
    const v = localStorage.getItem(RENDERER_KEY)
    return v === 'hd' || v === 'classic' ? v : null
  } catch {
    return null
  }
}
/** 是否已引导过（只打扰一次） */
function rendererAsked(): boolean {
  try {
    return localStorage.getItem(RENDERER_ASKED_KEY) === '1'
  } catch {
    return true
  }
}
function markRendererAsked() {
  try {
    localStorage.setItem(RENDERER_ASKED_KEY, '1')
  } catch {
    /* 隐私模式等写入失败时忽略 */
  }
}

const renderer = ref<'hd' | 'classic'>(readStoredRenderer() || 'hd')
/** 首次进入笔记预览时的渲染器引导弹窗 */
const rendererPickerVisible = ref(false)

function setRenderer(v: 'hd' | 'classic') {
  renderer.value = v
  try {
    localStorage.setItem(RENDERER_KEY, v)
  } catch {
    /* ignore */
  }
  // 高清模式下数据由 NoteViewer 内部按需加载；切换无须做额外动作
}

/** 引导弹窗中选定渲染器（是否已引导由弹窗 close 统一记录） */
function chooseRenderer(v: 'hd' | 'classic') {
  setRenderer(v)
  rendererPickerVisible.value = false
}

/* ===== 画板渲染：交给 NoteViewer，按需拉取 ===== */
const vfs = shallowRef<NoteVfs | null>(null)
/** NoteViewer 组件引用，用于在 pager-bar 中调 nextPage/prevPage/gotoPage */
const noteViewerRef = ref<NoteViewerInstance | null>(null)
/** NoteViewer 渲染失败时的兜底提示 */
const viewerError = ref('')
/** 上次同步给 NoteViewer 的页号（防止 watch 互相触发重复 selectPage） */
let lastSyncedPage = 1

/** NoteViewer 翻页事件 → 同步到外层 currentPage（pager-bar 显示用） */
function onPageChange(p: number) {
  if (typeof p === 'number') {
    lastSyncedPage = p
    if (currentPage.value !== p) currentPage.value = p
  }
}
/** NoteViewer 渲染失败 → 显示降级提示 */
function onViewerError(e: unknown) {
  viewerError.value = e instanceof Error ? e.message : String(e)
}

/**
 * 统一的翻页入口（pager-bar 按钮与页码输入框共用）。
 * 只更新 currentPage，再由下方 watch 同步给 NoteViewer ——
 * 传统渲染器下 NoteViewer 不挂载，翻页不能依赖它，否则按钮会静默失效。
 */
function gotoPage(v: number | undefined) {
  if (!v || !pages.value.length) return
  currentPage.value = Math.min(Math.max(1, Math.round(v)), pages.value.length)
}

async function loadResources() {
  if (!fileId.value) return
  loading.value = true
  pageMap.value = {}
  pages.value = []
  currentPage.value = 1
  lastSyncedPage = 1
  vfs.value = null
  viewerError.value = ''
  // 解析每个资源：传统渲染器走 pageMap；高清渲染器走 pages[]/images[] 喂给 NoteVFS。
  const pageMapLocal: Record<number, PageData> = {}
  // key = pageKey；value = { snapshotUrl?, screenshotUrl?, width?, height?, touchUrls }
  const notePageMap = new Map<number, NotePage>()
  // 共享图片（resourceType 0）→ res/image/<fileName>
  const noteImages = new Map<string, NoteImage>()
  try {
    const list = await getNoteResources(fileId.value)
    for (const item of list) {
      const page = item.pageIndex + 1
      const full = fullUrl(item)
      if (item.resourceType === 1) {
        // 画板数据三类：
        //   snapshot.bin —— 矢量快照，交给 NoteViewer 渲染
        //   *_touch.bin  —— 旧笔记的笔触（每段一个独立文件）
        //   page_mdb/data.mdb —— 新笔记的笔触来源（ObjectBox，App 不再单独上传 _touch.bin）
        // lock.mdb 只是 LMDB 锁页，无需处理
        if (/snapshot\.bin$/i.test(item.ossImageUrl)) {
          const np = notePageMap.get(page) || { pageKey: page, snapshotUrl: '' }
          np.snapshotUrl = full
          notePageMap.set(page, np)
          // 只画了一个形状、没有图片资源的页也要能预览
          if (!pageMapLocal[page]) pageMapLocal[page] = { originals: [] }
        } else if (/data\.mdb$/i.test(item.ossImageUrl)) {
          const np = notePageMap.get(page) || { pageKey: page, snapshotUrl: '' }
          np.mdbUrl = full
          notePageMap.set(page, np)
        } else if (/_touch\.bin$/i.test(item.ossImageUrl)) {
          const np = notePageMap.get(page) || { pageKey: page, snapshotUrl: '' }
          if (!np.touchUrls) np.touchUrls = []
          np.touchUrls.push(full)
          notePageMap.set(page, np)
        }
        continue
      }
      // 过滤其他模板 bin 等非图片资源
      if (!IMG_EXT_RE.test(item.ossImageUrl)) continue
      if (!pageMapLocal[page]) pageMapLocal[page] = { originals: [] }
      if (item.resourceType === 2) {
        // resourceType 2 为页面总览截图
        pageMapLocal[page].thumbnail = toEntry(item)
        // 同步记录到 NotePage，方便合成 header.bin 时取画布尺寸
        const np = notePageMap.get(page) || { pageKey: page, snapshotUrl: '' }
        const img = new Image()
        img.src = pageMapLocal[page].thumbnail!.imgSrc
        await new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth) return resolve()
          img.onload = () => resolve()
          img.onerror = () => resolve()
        })
        if (img.naturalWidth > 1 && img.naturalHeight > 1) {
          np.width = img.naturalWidth
          np.height = img.naturalHeight
          // 底色与背景网格/横线一律由 noteVfs 从该页 mdb 读取
          //（HeaderEntity.defaultBackgroundColor / BackgroundLineConfigEntity），
          // 这里不再做任何截图采样 / 图像推断。
        }
        notePageMap.set(page, np)
      } else if (item.resourceType === 0) {
        // 共享图片（res/image/*），多页共用
        pageMapLocal[page].originals.push(toEntry(item))
        const fileName = item.ossImageUrl.split('/').pop() || item.ossImageUrl
        if (!noteImages.has(fileName)) noteImages.set(fileName, { fileName, url: full })
      } else {
        // 其他图片：作为页内预览图（不进入 VFS 共享池）
        pageMapLocal[page].originals.push(toEntry(item))
      }
    }
    pageMap.value = pageMapLocal
    // 优先按"有画板数据的页"翻页，没有时退回原来的"有图片的页"
    const boardPages = Array.from(notePageMap.values())
      .filter(p => p.snapshotUrl)
      .map(p => p.pageKey)
      .sort((a, b) => a - b)
    pages.value = boardPages.length
      ? boardPages
      : Object.keys(pageMapLocal).map(Number).sort((a, b) => a - b)
    // 喂给 NoteViewer 的懒加载 VFS
    const validPages = Array.from(notePageMap.values()).filter(p => p.snapshotUrl)
    if (validPages.length) {
      vfs.value = await createNoteVfs({
        pages: validPages,
        images: Array.from(noteImages.values()),
        // 资源统一走项目代理（npm 包默认直连 fetch）
        fetchBlob: async (url: string) => {
          const res = await fetch(resourceFetchUrl(url))
          if (!res.ok) throw new Error('资源下载失败：HTTP ' + res.status)
          return await res.blob()
        }
      })
    }
  } catch (e: any) {
    ElMessage.error(e.message || '加载笔记失败')
  } finally {
    loading.value = false
  }
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

/** PDF 页脚：右下角一行说明 */
function addPdfFooter(pdf: jsPDF, pageW: number, pageH: number) {
  pdf.setFontSize(8)
  pdf.setTextColor(100)
  pdf.text(PDF_FOOTER, pageW - pdf.getTextWidth(PDF_FOOTER) - 20, pageH - 20)
}

interface PdfPageJob {
  /** 矢量 SVG（高清模式取到时） */
  svg?: string
  /** 页面截图 dataURL（传统模式，或高清失败后的降级） */
  dataUrl?: string
  w?: number
  h?: number
}

/**
 * 准备一页的绘制数据。高清模式优先取矢量 SVG，取不到再回落到截图。
 * @param order  在查看器内的页序（1-based 连续）—— 用于向 NoteViewer 取矢量页
 * @param pageNo 原始页号（pageIndex+1）—— 用于取该页截图
 */
async function preparePdfPage(order: number, pageNo: number, hd: boolean): Promise<PdfPageJob | null> {
  if (hd && noteViewerRef.value) {
    const svg = await noteViewerRef.value.pageSvg(order)
    if (svg) return { svg }
  }
  const pd = pageMap.value[pageNo]
  if (!pd?.thumbnail) return null
  const dataUrl = await loadImageAsDataURL(pd.thumbnail.raw)
  const img = new Image()
  img.src = dataUrl
  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })
  if (!img.width || !img.height) return null
  return { dataUrl, w: img.width, h: img.height }
}

/**
 * 导出 PDF，两种模式：
 * - 传统渲染器：把页面截图铺进 PDF（位图）
 * - 高清渲染器：把该页矢量 SVG 直接绘入 PDF（路径/文字/图片，放大不失真）
 *   某页若拿不到矢量数据，自动回退为截图，保证导出结果不为空。
 */
async function exportPdf() {
  if (pages.value.length === 0) return
  const hd = renderer.value === 'hd'
  exporting.value = true
  progressVisible.value = true
  progressText.value = hd ? '正在导出高清 PDF（矢量）...' : '正在导出 PDF...'
  progressPercent.value = 0
  try {
    // compress + floatPrecision：矢量页内容流是纯文本坐标，不压缩会到几十 MB
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true, floatPrecision: 2 })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()

    // 高清模式注册中文字体：中文以矢量文字写入（jsPDF 只嵌入用到的字形，通常几百 KB）；
    // 字体拉取失败时 cjkFont 为 undefined，中文会自动回退为位图，不影响导出。
    let cjkFont: string | undefined
    if (hd) {
      progressText.value = '正在加载中文字体...'
      cjkFont = await ensureCjkPdfFont(pdf)
      progressText.value = cjkFont ? '正在导出高清 PDF（矢量）...' : '正在导出高清 PDF（中文回退位图）...'
    }

    // 1) 先取齐每页数据，避免画到一半才发现缺数据而留下空白页
    const jobs: PdfPageJob[] = []
    for (let i = 0; i < pages.value.length; i++) {
      const job = await preparePdfPage(i + 1, pages.value[i], hd)
      if (job) jobs.push(job)
      progressPercent.value = Math.round(((i + 1) / pages.value.length) * 45)
    }
    if (!jobs.length) throw new Error('没有可导出的页面')

    // 2) 逐页绘制
    let added = 0
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]
      if (added > 0) pdf.addPage()
      let drew = false
      if (job.svg) {
        const n = await drawSvgToPdf(pdf, job.svg, { x: 0, y: 0, w: pageW, h: pageH }, { cjkFont })
        drew = n > 0
      }
      if (!drew && job.dataUrl && job.w && job.h) {
        const fmt = /^data:image\/(\w+)/i.exec(job.dataUrl)?.[1]?.toLowerCase() || 'png'
        const type = fmt === 'jpg' || fmt === 'jpeg' ? 'JPEG' : fmt.toUpperCase()
        const ratio = Math.min(pageW / job.w, pageH / job.h)
        const w = job.w * ratio
        const h = job.h * ratio
        pdf.addImage(job.dataUrl, type, (pageW - w) / 2, (pageH - h) / 2, w, h)
        drew = true
      }
      if (!drew) {
        // 两种方式都没画出来：撤掉刚加上的空白页
        if (added > 0) pdf.deletePage(pdf.getNumberOfPages())
      } else {
        addPdfFooter(pdf, pageW, pageH)
        added++
      }
      progressPercent.value = 45 + Math.round(((i + 1) / jobs.length) * 55)
    }
    if (!added) throw new Error('没有可导出的页面')

    const pdfBlob = pdf.output('blob')
    await saveBlobFile(pdfBlob, (fileName.value || 'note') + '.pdf')
    ElMessage.success(hd ? '高清 PDF 已导出（矢量）' : 'PDF 导出完成')
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

onMounted(() => {
  loadResources()
  // 第一次进入笔记预览：先让用户选一次渲染方式，选择结果记入本地存储
  if (!rendererAsked()) rendererPickerVisible.value = true
})
// keep-alive 会复用同一组件实例，切换不同笔记文件时需重新加载
watch(
  () => [route.params.fileId, route.query.name],
  () => loadResources()
)
// NoteViewer 内部自己管理翻页；这里只把外部 currentPage 同步给 NoteViewer
// （传统渲染器下没有 NoteViewer，currentPage 即唯一数据源，这里直接放行）
watch(currentPage, (v) => {
  if (!v || v === lastSyncedPage) return
  lastSyncedPage = v
  if (!noteViewerRef.value || !pages.value.length) return
  noteViewerRef.value.gotoPage(v)
})
</script>

<style scoped>
.note-detail {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  min-height: 100%;
  overflow: hidden;
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
  min-height: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
}
/* 高清渲染器：画板撑满可用高度，外层不再滚动 */
.preview-body--hd {
  align-items: stretch;
  overflow: hidden;
}
.preview-body :deep(.el-empty) {
  align-self: center;
}
.page-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.page-content--hd {
  height: 100%;
}
/* 页面总览：居中 */
.thumb-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}
/* 高清渲染器下画板占满剩余空间 */
.page-content--hd .thumb-wrap {
  flex: 1 1 auto;
  min-height: 0;
  margin-bottom: 0;
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
/* 高清渲染器：画板撑满 .thumb-wrap（父级已按 flex 分配好高度） */
.thumb-board {
  width: 100%;
  height: 100%;
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

/* ===== 首次进入的渲染器选择弹窗 ===== */
.renderer-options {
  display: flex;
  align-items: stretch;
  gap: 14px;
}
/* 两个大卡片：桌面左右并排，手机上下堆叠 */
.renderer-card {
  position: relative;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
}
.renderer-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}
.renderer-card:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.renderer-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.renderer-card-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.renderer-card-icon {
  font-size: 26px;
  color: var(--el-color-primary);
}
.renderer-card-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.renderer-card-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.renderer-card-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}
.renderer-card-item {
  position: relative;
  padding-left: 14px;
}
.renderer-card-item::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-color-primary);
  opacity: 0.65;
}
.renderer-card-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 18px;
}
.renderer-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

/* 手机端：两个大框改为上下排列 */
@media (max-width: 767px) {
  .renderer-options {
    flex-direction: column;
  }
  .renderer-card {
    padding: 14px;
  }
  .renderer-card-icon {
    font-size: 22px;
  }
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

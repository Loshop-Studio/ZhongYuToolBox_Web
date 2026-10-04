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
        <el-dropdown trigger="click" :disabled="loading || exporting || downloading || !pages.length" @command="onActionCommand">
          <el-button type="success" :loading="exporting" :disabled="loading || downloading || !pages.length" title="导出 PDF / SVG" aria-label="导出笔记">
            <el-icon><Document /></el-icon>
          </el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="pdf">{{ renderer === 'hd' ? '高清矢量 PDF' : '页面截图 PDF' }}</el-dropdown-item>
            <el-dropdown-item command="svg">当前页 SVG</el-dropdown-item>
            <el-dropdown-item command="svgs">全部页面 SVG（ZIP）</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
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
            <div class="actions-item" @click="onActionCommand('svg')">
              <el-icon><Picture /></el-icon><span>导出当前页 SVG</span>
            </div>
            <div class="actions-item" @click="onActionCommand('svgs')">
              <el-icon><Download /></el-icon><span>导出全部页面 SVG（ZIP）</span>
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

    <div v-loading="loading" class="preview-body" :class="{ 'preview-body--hd': useHd }">
      <el-empty v-if="!loading && pages.length === 0" description="该笔记没有可预览的内容" />
      <div v-else-if="currentPageData" class="page-content" :class="{ 'page-content--hd': useHd }">
        <!-- 页面总览：传统渲染器直接显示笔记截图，高清渲染器渲染真实画板 -->
        <div class="thumb-wrap">
          <el-image
            v-if="!useHd"
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
                <span>{{ viewerError ? '高清预览失败，请使用页面截图' : '总览图加载失败' }}</span>
              </div>
            </template>
          </el-image>
          <NoteViewer
            v-else-if="vfs && useHd"
            ref="noteViewerRef"
            :key="fileId"
            :source="vfs"
            :initial-page="hdCurrentPage"
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
        <div v-if="!useHd && currentPageData.originals.length" class="originals-block">
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
            <span class="renderer-card-item">可导出高清矢量 PDF 与 SVG</span>
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
      :width="isMobile ? '92%' : '360px'"
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
import { ref, shallowRef, computed, onMounted, onUnmounted, onActivated, onDeactivated, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Document, Download, Picture, PictureFilled, MoreFilled, Loading, InfoFilled } from '@element-plus/icons-vue'
import JSZip from 'jszip'
import { NoteViewer, noteToSvgs, notePageSvg, type NoteViewerInstance } from 'ezy-board-viewer'
import { getNoteResources, getNoteResourcesForZip } from '@/api/note'
import { resourceFetchUrl } from '@/utils/proxy'
import { saveBlobFile } from '@/utils/saveFile'
import { formatError, logError } from '@/utils/errorText'
import { useIsMobile } from '@/composables/useIsMobile'
import { createNoteVfs, type NoteVfs } from '@/utils/noteVfs'
import { detectBgLines } from '@/utils/noteBackground'
import { accountKey } from '@/utils/localData'
import { buildNotePdf, loadNoteImage } from '@/utils/notePdf'
import { buildNoteSvgPage, buildNoteSvgArchive } from '@/utils/noteSvg'
import { collectNoteResources, noteResourceUrl, NOTE_IMAGE_EXT, type NotePageData } from '@/utils/noteResourceModel'
const { isMobile } = useIsMobile()
const PDF_FOOTER = 'Loshop / aoki · https://github.com/nickfox395/ZhongYuToolBox_Web'
const route = useRoute(), router = useRouter()
const fileId = computed(() => String(route.params.fileId || ''))
const fileName = computed(() => String(route.query.name || ''))
const loading = ref(false), exporting = ref(false), downloading = ref(false), showSheet = ref(false)
const progressVisible = ref(false), progressPercent = ref(0), progressText = ref('')
const pageMap = ref<Record<number, NotePageData>>({}), pages = ref<number[]>([]), currentPage = ref(1)
const currentPageData = computed(() => pageMap.value[pages.value[currentPage.value - 1]])
const originalPreviewList = computed(() => (currentPageData.value?.originals || []).map(o => o.imgSrc))
const vfs = shallowRef<NoteVfs | null>(null), hdPages = ref<number[]>([])
const noteViewerRef = ref<NoteViewerInstance | null>(null), viewerError = ref('')
const hdCurrentPage = computed(() => hdPages.value.indexOf(pages.value[currentPage.value - 1]) + 1)
const useHd = computed(() => renderer.value === 'hd' && hdCurrentPage.value > 0 && !viewerError.value)
let controller = new AbortController()
function scope() {
  const owner = controller, key = accountKey(), id = fileId.value
  return { signal: owner.signal, ensure() {
    if (owner.signal.aborted || controller !== owner || accountKey() !== key || fileId.value !== id)
      throw new DOMException('笔记任务已取消', 'AbortError')
  } }
}
function goBack() { if (window.history.state?.back) router.back(); else router.push('/note') }
function onActionCommand(cmd: string) {
  showSheet.value = false
  if (cmd === 'pdf') exportPdf()
  else if (cmd === 'svg' || cmd === 'svgs') exportSvg(cmd === 'svgs')
  else if (cmd === 'zip') downloadZip()
  else if (cmd === 'renderer') setRenderer(renderer.value === 'hd' ? 'classic' : 'hd')
}
function stored(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function store(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* optional preference */ } }
const renderer = ref<'hd' | 'classic'>(stored('noteRenderer') === 'classic' ? 'classic' : 'hd')
const rendererPickerVisible = ref(false)
function markRendererAsked() { store('noteRendererAsked', '1') }
function setRenderer(value: 'hd' | 'classic') { viewerError.value = ''; renderer.value = value; store('noteRenderer', value) }
function chooseRenderer(value: 'hd' | 'classic') { setRenderer(value); rendererPickerVisible.value = false; markRendererAsked() }
function onPageChange(page: number) {
  const external = pages.value.indexOf(hdPages.value[page - 1]) + 1
  if (external > 0 && external !== currentPage.value) currentPage.value = external
}
function onViewerError(error: unknown) { viewerError.value = formatError(error) }
function gotoPage(page?: number) { if (page && pages.value.length) currentPage.value = Math.min(Math.max(1, Math.round(page)), pages.value.length) }
async function loadResources() {
  controller.abort(); controller = new AbortController()
  const task = scope()
  exporting.value = downloading.value = progressVisible.value = showSheet.value = false
  pageMap.value = {}; pages.value = []; hdPages.value = []; currentPage.value = 1; vfs.value = null; viewerError.value = ''
  if (!fileId.value) { loading.value = false; return }
  loading.value = true
  try {
    const data = collectNoteResources(await getNoteResources(fileId.value, task.signal)); task.ensure()
    // Only vector pages need a screenshot read to recover the original canvas geometry.
    for (const page of data.boards) {
      const thumbnail = data.pageMap[page.pageKey]?.thumbnail
      if (!thumbnail) continue
      const image = await loadNoteImage(thumbnail.imgSrc, task.signal).catch(error => { task.ensure(); return null })
      task.ensure()
      if (image) {
        page.width = image.naturalWidth; page.height = image.naturalHeight
        page.bgLines = detectBgLines(image) || undefined
        try {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
          const [r,g,b,a] = context.getImageData(0,0,1,1).data
          page.bgcolor = a ? ((a << 24) | (r << 16) | (g << 8) | b) | 0 : -1
        } catch { /* cross-origin screenshot; default background remains available */ }
      }
    }
    task.ensure()
    const source = data.boards.length ? await createNoteVfs({ pages: data.boards, images: data.images, fetchBlob: async url => {
      task.ensure(); const response = await fetch(resourceFetchUrl(url), { signal: task.signal }); task.ensure()
      if (!response.ok) throw new Error('资源下载失败：HTTP ' + response.status)
      return response.blob()
    } }) : null
    task.ensure(); pageMap.value = data.pageMap; pages.value = data.pages
    hdPages.value = data.boards.map(p => p.pageKey); vfs.value = source
  } catch (error: any) { if (error.name !== 'AbortError') ElMessage.error('加载笔记失败：' + formatError(error)) }
  finally { if (!task.signal.aborted) loading.value = false }
}
async function exportPdf() {
  if (!pages.value.length || exporting.value || downloading.value) return
  const task = scope(), name = fileName.value || 'note', keys = [...pages.value], vectorKeys = [...hdPages.value]
  const source = vfs.value, data = pageMap.value, hd = renderer.value === 'hd'
  exporting.value = progressVisible.value = true; progressPercent.value = 0
  progressText.value = hd ? '正在重建矢量笔记...' : '正在导出页面截图...'
  try {
    let vectors: Array<{ svg?: string; error?: string }> = []
    if (hd && source) {
      try { vectors = await noteToSvgs(source) } catch { task.ensure(); /* screenshots are still usable */ }
    }
    task.ensure()
    const result = await buildNotePdf(keys.map(key => ({ key, svg: vectors[vectorKeys.indexOf(key)]?.svg, thumbnail: data[key]?.thumbnail?.raw })), {
      signal: task.signal, footer: PDF_FOOTER,
      onProgress(done, total) { task.ensure(); progressPercent.value = Math.round(done / total * 100) }
    })
    task.ensure(); await saveBlobFile(result.blob, name + '.pdf', { localOnly: true }); task.ensure()
    ElMessage.success(result.fallbackPages.length ? `PDF 导出完成（${result.fallbackPages.length} 页使用截图）` : 'PDF 导出完成')
  } catch (error: any) { if (error.name !== 'AbortError') { logError('exportPdf', error); ElMessage.error('导出 PDF 失败：' + formatError(error)) } }
  finally { if (!task.signal.aborted) exporting.value = progressVisible.value = false }
}
async function exportSvg(allPages: boolean) {
  if (loading.value || !pages.value.length || exporting.value || downloading.value) return
  const task = scope(), name = fileName.value || 'note'
  const keys = allPages ? [...pages.value] : [pages.value[currentPage.value - 1]]
  const vectorKeys = [...hdPages.value], source = vfs.value, data = pageMap.value
  exporting.value = progressVisible.value = true; progressPercent.value = 0
  progressText.value = '正在重建 SVG（笔迹与文字保留矢量，原始图片保留位图）…'
  try {
    let vectors: Array<{ svg?: string }> = []
    if (source) {
      if (allPages) vectors = await noteToSvgs(source)
      else {
        const index = vectorKeys.indexOf(keys[0])
        if (index >= 0) vectors[index] = { svg: await notePageSvg(source, index, { fetchOptions: { signal: task.signal } }) || undefined }
      }
    }
    task.ensure()
    const jobs = keys.map(key => ({ key, svg: vectors[vectorKeys.indexOf(key)]?.svg, thumbnail: data[key]?.thumbnail?.raw }))
    let blob: Blob, fallbackPages: number[]
    if (allPages) {
      progressText.value = '正在打包每页 SVG…'
      const result = await buildNoteSvgArchive(jobs, { signal: task.signal, onProgress(done, total) { task.ensure(); progressPercent.value = Math.round(done / total * 100) } })
      blob = result.blob; fallbackPages = result.fallbackPages
    } else {
      const result = await buildNoteSvgPage(jobs[0], { signal: task.signal })
      blob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }); fallbackPages = result.fallback ? keys : []
      progressPercent.value = 100
    }
    task.ensure()
    await saveBlobFile(blob, allPages ? name + '-SVG.zip' : `${name}-第${keys[0]}页.svg`, { localOnly: true })
    task.ensure()
    ElMessage.success(fallbackPages.length ? `SVG 导出完成（${fallbackPages.length} 页仅有截图，已标注为位图）` : 'SVG 导出完成')
  } catch (error: any) { if (error.name !== 'AbortError') { logError('exportSvg', error); ElMessage.error('导出 SVG 失败：' + formatError(error)) } }
  finally { if (!task.signal.aborted) exporting.value = progressVisible.value = false }
}
async function downloadZip() {
  if (exporting.value || downloading.value) return
  const task = scope(), name = fileName.value || 'note'
  downloading.value = progressVisible.value = true; progressPercent.value = 0; progressText.value = '正在获取笔记图片...'
  try {
    const list = await getNoteResourcesForZip(fileId.value, task.signal); task.ensure()
    const zip = new JSZip(), count: Record<number, number> = {}
    for (const [index, item] of list.entries()) {
      task.ensure(); const raw = noteResourceUrl(item)
      if (NOTE_IMAGE_EXT.test(raw.split(/[?#]/)[0])) {
        const response = await fetch(resourceFetchUrl(raw), { signal: task.signal })
        if (!response.ok) throw new Error('图片下载失败：HTTP ' + response.status)
        const blob = await response.blob(); task.ensure()
        count[item.pageIndex] ||= 1
        const suffix = item.resourceType === 2 ? 'thumbnail' : count[item.pageIndex]++
        const ext = raw.split(/[?#]/)[0].split('.').pop()!.toLowerCase()
        zip.file(`${item.pageIndex + 1}-${suffix}.${ext}`, blob)
      }
      progressPercent.value = Math.round((index + 1) / list.length * 100)
    }
    progressText.value = '正在打包...'
    const content = await zip.generateAsync({ type: 'blob' }); task.ensure()
    await saveBlobFile(content, name + '.zip', { localOnly: true }); task.ensure(); ElMessage.success('下载已启动')
  } catch (error: any) { if (error.name !== 'AbortError') ElMessage.error('下载失败：' + formatError(error)) }
  finally { if (!task.signal.aborted) downloading.value = progressVisible.value = false }
}
onMounted(() => { loadResources(); if (stored('noteRendererAsked') !== '1') rendererPickerVisible.value = true })
watch(() => [route.params.fileId, route.query.name, accountKey()], () => loadResources())
watch(currentPage, () => { if (useHd.value) noteViewerRef.value?.gotoPage(hdCurrentPage.value) }, { flush: 'post' })
onActivated(() => { if (controller.signal.aborted) loadResources() })
onDeactivated(() => controller.abort())
onUnmounted(() => controller.abort())
</script>

<style scoped>
.note-detail {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
/* 顶部 sticky 返回栏（参考 Gblox 帖子详情 appbar） */
.appbar {
  flex-shrink: 0;
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
  min-height: 0;
}
/* 高清渲染器：画板撑满 .thumb-wrap（父级已按 flex 分配好高度） */
.thumb-board {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 4px;
  box-shadow: 0 2px 8px #ccc;
}
/* The outer pager includes screenshot-only pages, so keep only that pager. */
.thumb-board :deep(> div > div:last-child:has(> .el-button)) {
  display: none !important;
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
  flex-shrink: 0;
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
    height: 100%;
    min-height: 0;
  }
  .pager-bar {
    position: relative;
    flex-shrink: 0;
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
    margin-bottom: 0;
  }
  .page-input {
    width: 90px;
  }
  .page-info {
    font-size: 12px;
  }
}
</style>

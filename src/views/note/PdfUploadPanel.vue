<template>
  <div class="pdf-panel">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <el-icon><Document /></el-icon>
          <span>{{ imageMode ? '图片上传云笔记' : 'PDF上传云笔记' }}</span>
        </div>
      </template>

      <el-form label-position="top" :disabled="uploading || preparing">
        <el-form-item v-if="imageMode || pdfFiles.length <= 1" label="笔记名称">
          <el-input v-model="noteName" placeholder="请输入笔记名称" clearable />
        </el-form-item>

        <el-form-item :label="imageMode ? '选择图片' : '选择 PDF 文件'">
          <div class="pdf-drop" role="button" tabindex="0" :aria-label="imageMode ? '选择图片' : '选择 PDF 文件'" :aria-disabled="uploading || preparing" @click="triggerPick" @keydown.enter.prevent="triggerPick" @keydown.space.prevent="triggerPick">
            <el-icon class="upload-icon"><UploadFilled /></el-icon>
            <div class="el-upload__text">{{ imageMode ? '点击添加图片，可多选' : '点击添加 PDF 文件，可同时选择多个' }}</div>
            <input
              v-if="!isPlus"
              ref="fileInput"
              type="file"
              :accept="imageMode ? '.png,.jpg,.jpeg,.webp' : '.pdf'" multiple
              class="pdf-file-input"
              @change="onFileInputChange"
            />
          </div>
          <div v-if="currentFile" class="file-info">
            <el-tag type="success">{{ currentFile.name }}</el-tag>
            <span class="size">{{ formatFileSize(currentFile.size) }}</span>
          </div>
        </el-form-item>

        <div v-if="!imageMode && pdfFiles.length" class="pdf-queue">
          <p class="image-help">每个 PDF 单独保存为一条笔记，按队列在本机转横版并上传。成功项不会重复上传；失败项可重试。</p>
          <div v-for="(job,index) in pdfFiles" :key="job.id" class="pdf-queue-row">
            <div class="queue-file"><strong>{{ index + 1 }}. {{ job.file.name }}</strong><small>{{ formatFileSize(job.file.size) }}</small></div>
            <el-input v-if="pdfFiles.length > 1" v-model="job.name" :aria-label="'笔记名称 ' + job.file.name" :disabled="job.status === 'success'" placeholder="笔记名称" />
            <el-tag :type="job.status === 'failed' ? 'danger' : job.status === 'success' ? 'success' : 'info'">{{ {pending:'等待上传',uploading:'上传中',success:'已上传',failed:'失败'}[job.status] }}{{ job.status === 'uploading' ? ' ' + job.percent + '%' : '' }}</el-tag>
            <el-button :disabled="uploading || preparing" @click="applyFile(job.file)">预览</el-button><el-button :disabled="uploading || preparing" @click="removePdf(index)">移除</el-button>
            <small v-if="job.error" class="queue-error">{{ job.error }}</small>
          </div>
        </div>

        <div v-if="imageMode" class="image-selection">
          <p class="image-help">每张图片一页，按下面的顺序合成 PDF。竖版页逆时针旋转 90°，手动旋转每次逆时针 90°，手动设置后不再自动旋转该页；原图片不修改。支持 PNG、JPG、WebP；超过 4096 像素的长边等比例缩小。</p>
          <div v-for="(item, index) in imageFiles" :key="item.id" class="image-selection-row">
            <img :src="item.url" :alt="item.file.name" :style="{transform: `rotate(${-90 * (item.rotation ?? 0)}deg)`}" />
            <span class="image-file-name">{{ index + 1 }}. {{ item.file.name }}</span>
            <el-tag size="small">{{ item.rotation === null ? '自动横版' : '逆时针 ' + item.rotation * 90 + '°' }}</el-tag>
            <el-button :aria-label="'逆时针旋转图片 ' + (index + 1)" @click="rotateImage(index)">↶ 90°</el-button>
            <el-button v-if="item.rotation !== null" @click="resetRotation(index)">自动</el-button>
            <el-button :disabled="uploading || preparing || index === 0" :aria-label="'上移图片 ' + (index + 1)" @click="moveImage(index, -1)">上移</el-button>
            <el-button :disabled="uploading || preparing || index === imageFiles.length - 1" :aria-label="'下移图片 ' + (index + 1)" @click="moveImage(index, 1)">下移</el-button>
            <el-button :aria-label="'移除图片 ' + (index + 1)" @click="removeImage(index)">移除</el-button>
          </div>
          <el-button v-if="imageFiles.length" :loading="preparing" @click="prepareImages(true)">生成并预览 PDF</el-button>
        </div>
        <el-alert v-if="IS_WINDOWS" type="info" :closable="false" class="orientation-status" :title="preparing && !imageMode ? '正在本地处理 PDF…' : orientationText" />
        <el-form-item v-if="preparedPdf && (imageMode || rotatedPages.length)">
          <el-button :icon="Download" @click="downloadLandscapePdf">{{ imageMode ? '保存生成的 PDF 到本机' : '保存横版 PDF 到本机' }}</el-button>
        </el-form-item>

        <el-form-item label="进度">
          <el-progress
            :percentage="progressPercent"
            :status="progressStatus"
            :stroke-width="20"
            text-inside
            class="full-progress"
          />
          <small class="progress-text">{{ progressText }}</small>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="uploading" :disabled="preparing || (imageMode ? !imageFiles.length : !pdfFiles.some(job => job.status !== 'success'))" @click="handleUpload">
            <el-icon><Upload /></el-icon>
            {{ !imageMode && pdfFiles.length > 1 ? '批量上传 / 重试失败项' : '开始上传' }}
          </el-button>
          <el-button :disabled="images.length === 0" @click="downloadZip">
            <el-icon><Download /></el-icon>
            下载ZIP
          </el-button>
        </el-form-item>
      </el-form>
      <el-button v-if="uploading && !imageMode" :disabled="stopQueue" @click="stopQueue = true">{{ stopQueue ? '当前文件结束后停止' : '停止后续文件' }}</el-button>

      <div class="preview-block">
        <div class="preview-label">预览（当前文件或最近成功上传文件的前5页）</div>
        <div class="preview-container">
          <p v-if="previewUrls.length === 0" class="empty-tip">预览将在此显示...</p>
          <div v-for="(url, i) in previewUrls" :key="i" class="preview-item">
            <small>第{{ i + 1 }}页</small>
            <img :src="url" :alt="`第${i + 1}页`" />
          </div>
          <p v-if="images.length > 5" class="more-tip">...还有{{ images.length - 5 }}页</p>
        </div>
      </div>

      <el-alert type="info" :closable="false" class="usage">
        <template #title>使用说明</template>
        <ul class="usage-list">
          <li>aoki 版选择 PDF 后，在本机检测方向并逆时针旋转竖版页，整页等比例放入横版笔记画布，原文件不被覆盖。</li>
          <li v-if="imageMode">直接开始上传时，会先在本机按当前顺序合成 PDF。生成并预览是可选步骤。</li>
          <li>预览显示处理后的前 5 页，也可以先保存生成的 PDF 到本机。</li>
          <li>点击“开始上传”后，在本地转换页面图片，再上传并保存到当前账号的云笔记。</li>
          <li>上传完成后可下载页面图片 ZIP；请保持网络连接和页面开启。</li>
        </ul>
      </el-alert>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onDeactivated } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Upload, UploadFilled, Download } from '@element-plus/icons-vue'
import { uploadPdfAsNote, generateCustomFileId } from '@/api/pdfNote'
import { runNoteUploadQueue, type NoteUploadJob } from '@/utils/noteUploadQueue'
import { accountKey } from '@/utils/localData'
import { convertPdfToImages, zipBlobs, type PdfPageImage } from '@/utils/pdf'
import { prepareLandscapePdf } from '@/utils/pdfLandscape'
import { PLATFORM, IS_AOKI as IS_WINDOWS } from '@/config'
import { NOTE_CANVAS } from '@/utils/noteCanvas'
import { saveBlobFile } from '@/utils/saveFile'
import { imagesToPdf, validateImageFiles } from '@/utils/imagesToPdf'
import { isPlus, pickFiles } from '@/utils/plusPicker'
import { formatError, logError } from '@/utils/errorText'

const props = withDefaults(defineProps<{ source?: 'pdf' | 'images' }>(), { source: 'pdf' })
const imageMode = computed(() => props.source === 'images')
const imageFiles = ref<Array<{id: number; file: File; url: string; rotation: number | null}>>([])
const pdfFiles = ref<NoteUploadJob[]>([]), stopQueue = ref(false)
let disposed = false
let nextImageId = 0
let conversionAbort: AbortController | null = null
const noteName = ref('')
watch(noteName, value => { if (!imageMode.value && pdfFiles.value.length === 1) pdfFiles.value[0].name = value })
const currentFile = ref<File | null>(null)
const preparedPdf = ref<File | null>(null)
const preparing = ref(false)
const rotatedPages = ref<number[]>([])
const orientationText = ref(imageMode.value ? '图片按各自的方向设置在本机生成 PDF；自动模式会将竖版页逆时针旋转 90°。' : '竖版页面会在本机逆时针旋转 90°，横版及方形页面保持不变。')
let selectionRevision = 0
const uploading = ref(false)
const progressPercent = ref(0)
const progressText = ref('等待上传...')
const progressStatus = ref<'success' | 'exception' | undefined>(undefined)
const images = ref<PdfPageImage[]>([])
const previewUrls = ref<string[]>([])

/** 格式化文件大小（复刻 formatFileSize） */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / 1048576).toFixed(2) + ' MB'
}

async function applyFile(file: File) {
  if (uploading.value || preparing.value) return
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    ElMessage.warning('请选择 PDF 文件')
    return
  }
  currentFile.value = file
  noteName.value = pdfFiles.value.find(job => job.file === file)?.name || file.name.replace(/\.pdf$/i, '')
  clearPreview()
  progressPercent.value = 0
  progressStatus.value = undefined
  progressText.value = '等待上传...'
  preparedPdf.value = null
  rotatedPages.value = []
  if (!IS_WINDOWS) return
  const revision = ++selectionRevision
  preparing.value = true
  try {
    const result = await prepareLandscapePdf(file)
    if (revision !== selectionRevision) return
    preparedPdf.value = result.file
    rotatedPages.value = result.rotatedPages
    orientationText.value = result.rotatedPages.length
      ? `共 ${result.totalPages} 页，已在本机旋转 ${result.rotatedPages.length} 张竖版页面。原文件未修改。`
      : `共 ${result.totalPages} 页，没有竖版页面，保持原方向。`
    const preview = await convertPdfToImages(result.file, undefined, {maxPages: 5, canvasSize: {width: NOTE_CANVAS.width / 4, height: NOTE_CANVAS.height / 4}})
    if (revision === selectionRevision) buildPreview(preview)
  } catch (error: any) {
    if (revision !== selectionRevision) return
    currentFile.value = null
    preparedPdf.value = null
    orientationText.value = 'PDF 本地处理失败，请重新选择文件。'
    ElMessage.error('PDF 处理失败：' + formatError(error))
  } finally {
    if (revision === selectionRevision) preparing.value = false
  }
}

const fileInput = ref<HTMLInputElement | null>(null)

/** 点击选择区：移动端走系统文件选择，桌面/网页走原生文件输入框 */
function triggerPick() {
  if (uploading.value || preparing.value) return
  if (isPlus) {
    onPickPdf()
  } else {
    fileInput.value?.click()
  }
}

/** 原生 <input type="file"> 选中回调（桌面/网页端） */
function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (imageMode.value && input.files?.length) addImages(Array.from(input.files))
  else if (input.files?.length) addPdfs(Array.from(input.files))
  input.value = '' // 允许重复选择同一个文件
}
function addPdfs(files:File[]) {
  if (uploading.value || preparing.value) return
  if (files.some(file => !/\.pdf$/i.test(file.name))) { ElMessage.warning('请选择 PDF 文件'); return }
  pdfFiles.value = pdfFiles.value.filter(job => job.status !== 'success')
  for (const file of files) {
    if (pdfFiles.value.some(job => job.file.name === file.name && job.file.size === file.size && job.file.lastModified === file.lastModified)) continue
    pdfFiles.value.push({id:generateCustomFileId(),file,name:file.name.replace(/\.pdf$/i,''),status:'pending',percent:0,error:''})
  }
  if (pdfFiles.value.length === 1) { noteName.value = pdfFiles.value[0].name; applyFile(pdfFiles.value[0].file) }
  else { currentFile.value = null; preparedPdf.value = null; clearPreview(); progressStatus.value = undefined; progressPercent.value = 0; progressText.value = `已选择 ${pdfFiles.value.length} 个 PDF，等待批量上传`; orientationText.value = '上传时逐个在本机处理方向，不修改原文件。' }
}
function removePdf(index:number) {
  if (preparing.value || uploading.value) return
  const [job] = pdfFiles.value.splice(index,1)
  if (currentFile.value === job.file) { currentFile.value = null; preparedPdf.value = null; clearPreview() }
  if (pdfFiles.value.length === 1) noteName.value = pdfFiles.value[0].name
}

/** 5+ 下点击选择区：调系统文件选择框选取 PDF */
async function onPickPdf() {
  try {
    // 用 */* 调出系统文件管理器更稳妥（部分设备 application/pdf 选不出文件）
    const files = await pickFiles('*/*', true)
    const f = files[0]
    if (!f) return
    if (!/\.pdf$/i.test(f.name)) {
      ElMessage.warning('请选择 PDF 文件')
      return
    }
    addPdfs(files)
  } catch (e: any) {
    logError('onPickPdf', e)
    ElMessage.error('选择 PDF 失败：' + formatError(e))
  }
}

function invalidateImagePdf() {
  preparedPdf.value = null
  currentFile.value = null
  clearPreview()
  progressPercent.value = 0
  progressStatus.value = undefined
  progressText.value = '等待上传...'
  orientationText.value = '图片会在本机合成 PDF 后上传。'
}
function addImages(files: File[]) {
  if (preparing.value || uploading.value) return
  try { validateImageFiles(files) } catch (error) { ElMessage.error(formatError(error)); return }
  if (progressStatus.value === 'success') {
    imageFiles.value.forEach(item => URL.revokeObjectURL(item.url)); imageFiles.value = []
  }
  const newNote = !imageFiles.value.length
  invalidateImagePdf()
  if (newNote || !noteName.value) noteName.value = files[0].name.replace(/\.[^.]+$/, '')
  imageFiles.value.push(...files.map(file => ({id: ++nextImageId, file, rotation: null, url: URL.createObjectURL(file)})))
}
function rotateImage(index: number) {
  if (preparing.value || uploading.value) return
  const item = imageFiles.value[index]
  item.rotation = ((item.rotation ?? 0) + 1) % 4
  invalidateImagePdf()
}
function resetRotation(index: number) {
  if (preparing.value || uploading.value) return
  imageFiles.value[index].rotation = null
  invalidateImagePdf()
}
function moveImage(index: number, delta: number) {
  if (preparing.value || uploading.value || index + delta < 0 || index + delta >= imageFiles.value.length) return
  const [item] = imageFiles.value.splice(index, 1)
  imageFiles.value.splice(index + delta, 0, item)
  invalidateImagePdf()
}
function removeImage(index: number) {
  if (preparing.value || uploading.value) return
  const [item] = imageFiles.value.splice(index, 1)
  URL.revokeObjectURL(item.url)
  invalidateImagePdf()
}
async function prepareImages(showPreview: boolean): Promise<File | null> {
  if (preparing.value || !imageFiles.value.length) return null
  const revision = ++selectionRevision
  preparing.value = true
  orientationText.value = '正在本地合成 PDF…'
  conversionAbort = new AbortController()
  try {
    const file = await imagesToPdf(imageFiles.value.map(item => item.file), noteName.value.trim() || '图片笔记',
      (current, total) => {
        orientationText.value = '正在本地合成 PDF：' + current + '/' + total
        if (uploading.value) { progressPercent.value = Math.round(10 * current / total); progressText.value = orientationText.value }
      }, conversionAbort.signal, imageFiles.value.map(item => item.rotation))
    if (revision !== selectionRevision) return null
    preparedPdf.value = file
    currentFile.value = file
    orientationText.value = '已在本机生成 ' + imageFiles.value.length + ' 页 PDF，按各图片方向设置生成。'
    if (showPreview) {
      const preview = await convertPdfToImages(file, undefined, {maxPages: 5, canvasSize: {width: NOTE_CANVAS.width / 4, height: NOTE_CANVAS.height / 4}})
      if (revision === selectionRevision) buildPreview(preview)
    }
    return file
  } catch (error) {
    if (revision === selectionRevision) { preparedPdf.value = null; currentFile.value = null; ElMessage.error('图片转换失败：' + formatError(error)) }
    return null
  } finally { if (revision === selectionRevision) preparing.value = false; conversionAbort = null }
}
function clearPreview() {
  previewUrls.value.forEach((u) => URL.revokeObjectURL(u))
  previewUrls.value = []
  images.value = []
}

/** 生成前 5 页预览（复刻 previewPdfImages） */
function buildPreview(list: PdfPageImage[]) {
  previewUrls.value.forEach((u) => URL.revokeObjectURL(u))
  previewUrls.value = list.slice(0, 5).map((img) => URL.createObjectURL(img.blob))
}

async function handleUpload() {
  if (uploading.value || preparing.value) return
  if (!imageMode.value) { await uploadPdfs(); return }
  if (imageMode.value ? !imageFiles.value.length : !currentFile.value) {
    ElMessage.warning(imageMode.value ? '请先选择图片' : '请先选择 PDF 文件')
    return
  }
  if (!noteName.value.trim()) {
    ElMessage.warning('请输入笔记名称')
    return
  }

  uploading.value = true
  images.value = []
  progressStatus.value = undefined
  progressPercent.value = 0
  const uploadName = noteName.value.trim()
  const needsImageConversion = imageMode.value && !preparedPdf.value
  try {
    if (imageMode.value && !preparedPdf.value) {
      progressText.value = '正在本地将图片合成 PDF…'
      if (!await prepareImages(false)) throw new Error('图片未能生成 PDF，未开始上传')
    }
    const result = await uploadPdfAsNote({
      file: preparedPdf.value || currentFile.value,
      noteName: uploadName,
      autoLandscape: !preparedPdf.value,
      onProgress: (p, t) => {
        progressPercent.value = Math.round(needsImageConversion ? 10 + 0.9 * p : p)
        progressText.value = t
      }
    })
    images.value = result
    buildPreview(result)
    progressStatus.value = 'success'
    ElMessageBox.alert(
      `笔记"${uploadName}"已保存，共 ${result.length} 页`,
      '上传成功',
      { type: 'success' }
    )
  } catch (e: any) {
    progressStatus.value = 'exception'
    progressText.value = '失败：' + (e.message || '未知错误')
    ElMessage.error(e.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function uploadPdfs() {
  const jobs = pdfFiles.value, key = accountKey()
  if (jobs.length === 1) jobs[0].name = noteName.value.trim()
  if (jobs.some(job => job.status !== 'success' && !job.name.trim())) { ElMessage.warning('请为每个 PDF 填写笔记名称'); return }
  uploading.value = true; stopQueue.value = false; progressPercent.value = 0; progressStatus.value = undefined; images.value = []
  const isActive = () => { try { return !disposed && accountKey() === key } catch { return false } }
  try {
    const result = await runNoteUploadQueue(jobs,{isActive,shouldStop:()=>stopQueue.value,
      upload:async (job,onProgress) => {
        onProgress(1,'正在本地检查页面方向')
        const source = currentFile.value === job.file && preparedPdf.value ? preparedPdf.value : IS_WINDOWS ? (await prepareLandscapePdf(job.file)).file : job.file
        if (!isActive()) throw new Error('账号已变更或页面已关闭')
        return await uploadPdfAsNote({file:source,noteName:job.name.trim(),fileId:job.id,autoLandscape:false,onProgress})
      },onProgress:(percent,text) => { progressPercent.value = percent; progressText.value = text },
      onResult:(job,result) => { if (!disposed) { noteName.value = job.name; images.value = result; buildPreview(result) } }
    })
    progressStatus.value = result.failed ? 'exception' : result.stopped ? undefined : 'success'
    progressText.value = `本次成功 ${result.saved} 个，失败 ${result.failed} 个${result.stopped ? '，剩余文件尚未上传' : '，队列已完成'}`
    if (result.failed || result.stopped) ElMessage.warning(progressText.value); else ElMessage.success(progressText.value)
  } catch(error) { progressStatus.value = 'exception'; progressText.value = (error as Error).message; if (!disposed) ElMessage.error(progressText.value) }
  finally { uploading.value = false }
}

async function downloadLandscapePdf() {
  if (!preparedPdf.value) return
  try { await saveBlobFile(preparedPdf.value, preparedPdf.value.name) }
  catch (error) { ElMessage.error('保存失败：' + formatError(error)) }
}

/** 打包下载图片（复刻 downloadPdfImages） */
async function downloadZip() {
  if (images.value.length === 0) {
    ElMessage.warning('没有可下载的文件')
    return
  }
  const files = images.value.map((img, i) => ({
    name: 'page_' + String(i + 1).padStart(3, '0') + (img.blob.type === 'image/webp' ? '.webp' : '.png'),
    blob: img.blob
  }))
  const blob = await zipBlobs(files)
  try {
    await saveBlobFile(blob, (noteName.value.trim() || 'pdf_note') + '.zip')
    ElMessage.success('文件已保存')
  } catch (e: any) {
    logError('downloadZip', e)
    ElMessage.error('保存文件失败：' + formatError(e))
  }
}

onDeactivated(() => { stopQueue.value = true })
onBeforeUnmount(() => {
  disposed = true; stopQueue.value = true
  selectionRevision++
  conversionAbort?.abort()
  imageFiles.value.forEach(item => URL.revokeObjectURL(item.url))
  previewUrls.value.forEach((u) => URL.revokeObjectURL(u))
})
</script>

<style scoped>
.image-selection { margin-bottom: 20px; }
.pdf-queue { margin-bottom:20px; }
.pdf-queue-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:14px 0; border-bottom:1px solid var(--el-border-color); }
.queue-file { flex:1; min-width:160px; display:flex; flex-direction:column; gap:6px; overflow-wrap:anywhere; }
.queue-file small { color:var(--el-text-color-secondary); }
.pdf-queue-row .el-input { flex:1; min-width:180px; }
.queue-error { width:100%; color:var(--el-color-danger); }
.image-help { font-size: 14px; color: var(--el-text-color-secondary); line-height: 1.6; }
.image-selection-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--el-border-color); }
.image-selection-row img { width: 52px; height: 52px; object-fit: contain; background: #fff; border-radius: 8px; }
.image-file-name { flex: 1; min-width: 0; word-break: break-all; font-size: 14px; }
.image-selection-row .el-button { margin: 0; }
.pdf-panel {
  max-width: 900px;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
/* 5+ / 桌面 下的可点击选择区（普通 HTML，内部隐藏原生 file input） */
.pdf-file-input {
  display: none;
}
.pdf-drop {
  width: 100%;
  padding: 36px 0;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease;
}
.pdf-drop:hover {
  border-color: var(--el-color-primary);
}
.upload-icon {
  font-size: 44px;
  color: var(--el-text-color-placeholder);
  margin-bottom: 8px;
}
.file-info {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.file-info .size {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.full-progress {
  width: 100%;
}
.progress-text {
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.preview-block {
  margin-top: 8px;
}
.preview-label {
  font-weight: 500;
  margin-bottom: 8px;
}
.preview-container {
  max-height: 400px;
  overflow-y: auto;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 12px;
  text-align: center;
}
.empty-tip,
.more-tip {
  color: var(--el-text-color-secondary);
}
.preview-item {
  margin-bottom: 12px;
}
.preview-item img {
  display: block;
  margin: 4px auto 0;
  max-width: 100%;
  max-height: 200px;
}
.usage {
  margin-top: 16px;
}
.orientation-status { margin-bottom: 20px; }
.usage-list {
  margin: 6px 0 0;
  padding-left: 20px;
}
</style>

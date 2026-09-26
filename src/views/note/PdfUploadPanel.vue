<template>
  <div class="pdf-panel">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <el-icon><Document /></el-icon>
          <span>PDF上传云笔记</span>
        </div>
      </template>

      <el-form label-position="top">
        <el-form-item label="笔记名称">
          <el-input v-model="noteName" placeholder="请输入笔记名称（自动填充PDF文件名）" clearable />
        </el-form-item>

        <el-form-item label="选择PDF文件">
          <div class="pdf-drop" @click="triggerPick">
            <el-icon class="upload-icon"><UploadFilled /></el-icon>
            <div class="el-upload__text">点击选择 PDF 文件</div>
            <input
              v-if="!isPlus"
              ref="fileInput"
              type="file"
              accept=".pdf"
              class="pdf-file-input"
              @change="onFileInputChange"
            />
          </div>
          <div v-if="currentFile" class="file-info">
            <el-tag type="success">{{ currentFile.name }}</el-tag>
            <span class="size">{{ formatFileSize(currentFile.size) }}</span>
          </div>
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
          <el-button type="primary" :loading="uploading" @click="handleUpload">
            <el-icon><Upload /></el-icon>
            开始上传
          </el-button>
          <el-button :disabled="images.length === 0" @click="downloadZip">
            <el-icon><Download /></el-icon>
            下载ZIP
          </el-button>
        </el-form-item>
      </el-form>

      <div class="preview-block">
        <div class="preview-label">预览（前5页）</div>
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
          <li>选择PDF文件后，系统会自动将每一页转换为图片</li>
          <li>所有图片将打包为ZIP文件，便于下载和分享</li>
          <li>点击"开始上传"处理，处理完成后可下载ZIP或已保存到云笔记</li>
          <li>支持前端解压预览，无需服务器端解压</li>
        </ul>
      </el-alert>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Upload, UploadFilled, Download } from '@element-plus/icons-vue'
import { uploadPdfAsNote } from '@/api/pdfNote'
import { zipBlobs, type PdfPageImage } from '@/utils/pdf'
import { saveBlobFile } from '@/utils/saveFile'
import { isPlus, pickFiles } from '@/utils/plusPicker'
import { formatError, logError } from '@/utils/errorText'

const noteName = ref('')
const currentFile = ref<File | null>(null)
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

function applyFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    ElMessage.warning('请选择 PDF 文件')
    return
  }
  currentFile.value = file
  if (!noteName.value) {
    noteName.value = file.name.replace(/\.pdf$/i, '')
  }
  clearPreview()
}

const fileInput = ref<HTMLInputElement | null>(null)

/** 点击选择区：移动端走系统文件选择，桌面/网页走原生文件输入框 */
function triggerPick() {
  if (isPlus) {
    onPickPdf()
  } else {
    fileInput.value?.click()
  }
}

/** 原生 <input type="file"> 选中回调（桌面/网页端） */
function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) applyFile(f)
  input.value = '' // 允许重复选择同一个文件
}

/** 5+ 下点击选择区：调系统文件选择框选取 PDF */
async function onPickPdf() {
  try {
    // 用 */* 调出系统文件管理器更稳妥（部分设备 application/pdf 选不出文件）
    const files = await pickFiles('*/*', false)
    const f = files[0]
    if (!f) return
    if (!/\.pdf$/i.test(f.name)) {
      ElMessage.warning('请选择 PDF 文件')
      return
    }
    applyFile(f)
  } catch (e: any) {
    logError('onPickPdf', e)
    ElMessage.error('选择 PDF 失败：' + formatError(e))
  }
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
  if (!currentFile.value) {
    ElMessage.warning('请先选择PDF文件')
    return
  }
  if (!noteName.value.trim()) {
    ElMessage.warning('请输入笔记名称')
    return
  }

  uploading.value = true
  progressStatus.value = undefined
  progressPercent.value = 0
  try {
    const result = await uploadPdfAsNote({
      file: currentFile.value,
      noteName: noteName.value.trim(),
      onProgress: (p, t) => {
        progressPercent.value = Math.round(p)
        progressText.value = t
      }
    })
    images.value = result
    buildPreview(result)
    progressStatus.value = 'success'
    ElMessageBox.alert(
      `笔记"${noteName.value.trim()}"已保存，共 ${result.length} 页`,
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

/** 打包下载图片（复刻 downloadPdfImages） */
async function downloadZip() {
  if (images.value.length === 0) {
    ElMessage.warning('没有可下载的文件')
    return
  }
  const files = images.value.map((img, i) => ({
    name: 'page_' + String(i + 1).padStart(3, '0') + '.jpg',
    blob: img.blob
  }))
  const blob = await zipBlobs(files)
  try {
    await saveBlobFile(blob, (noteName.value.trim() || 'pdf_note') + '.zip')
    ElMessage.success('已保存到下载目录')
  } catch (e: any) {
    logError('downloadZip', e)
    ElMessage.error('保存文件失败：' + formatError(e))
  }
}

onBeforeUnmount(() => {
  previewUrls.value.forEach((u) => URL.revokeObjectURL(u))
})
</script>

<style scoped>
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
.usage-list {
  margin: 6px 0 0;
  padding-left: 20px;
}
</style>

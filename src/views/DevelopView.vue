<template>
  <div class="dev-page">
    <el-alert type="info" :closable="false" show-icon class="mb">
      开发工具：OSS 多类型直传与题库上传（直传中育对象存储，需登录态）。上传成功后返回可访问的 OSS 地址。
    </el-alert>

    <el-card class="block" header="OSS 多类型上传">
      <el-form label-position="top">
        <el-form-item label="上传类型前缀">
          <el-select v-model="fc" placeholder="选择类型" style="width: 100%">
            <el-option v-for="p in prefixes" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="选择文件（可多选）">
          <div v-if="isPlus" class="file-drop" @click="onPickOss">
            <el-icon class="upload-icon"><UploadFilled /></el-icon>
            <div class="el-upload__text">点击选择文件（已选 {{ selectedFiles.length }} 个）</div>
          </div>
          <el-upload
            v-else
            v-model:file-list="fileList"
            :auto-upload="false"
            multiple
            drag
            class="uploader"
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">将文件拖到此处，或<em>点击选择</em></div>
          </el-upload>
        </el-form-item>
        <el-button
          type="primary"
          :icon="Upload"
          :loading="uploading"
          :disabled="ossFileCount === 0"
          @click="doUpload"
        >
          开始上传（{{ ossFileCount }} 个文件）
        </el-button>
      </el-form>

      <div v-if="results.length" class="results">
        <div class="results-title">上传结果</div>
        <div v-for="(r, i) in results" :key="i" class="result-item">
          <span class="r-name" :title="r.name">{{ r.name }}</span>
          <el-tag v-if="r.ok" type="success" size="small">成功</el-tag>
          <el-tag v-else type="danger" size="small">失败</el-tag>
          <el-input v-if="r.ok" :model-value="r.url" readonly size="small" class="r-url" />
          <span v-else class="r-err">{{ r.error }}</span>
        </div>
      </div>
    </el-card>

    <el-card class="block" header="题库上传">
      <p class="muted">将题库文件（如 Excel/压缩包）上传至 <code>study_v2</code> 资源分类。</p>
      <div v-if="isPlus" class="file-drop" @click="onPickBank">
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="el-upload__text">{{ bankFile ? bankFile.name : '点击选择题库文件' }}</div>
      </div>
      <el-upload
        v-else
        :auto-upload="false"
        :show-file-list="true"
        drag
        class="uploader"
        @change="onBankChange"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">将题库文件拖到此处，或<em>点击选择</em></div>
      </el-upload>
      <el-button
        type="success"
        :icon="Upload"
        :loading="bankUploading"
        :disabled="!bankFile"
        @click="doBankUpload"
      >
        上传题库
      </el-button>
      <el-input v-if="bankUrl" :model-value="bankUrl" readonly class="bank-url" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, UploadFilled } from '@element-plus/icons-vue'
import type { UploadUserFile, UploadFile } from 'element-plus'
import { uploadFile, fetchUserId } from '@/utils/oss'
import { OSS_PREFIXES } from '@/config'
import { useAuthStore } from '@/stores/auth'
import { isPlus, pickFiles } from '@/utils/plusPicker'
import { formatError, logError } from '@/utils/errorText'

const auth = useAuthStore()
const prefixes = OSS_PREFIXES

const fc = ref('note_v2')
const fileList = ref<UploadUserFile[]>([])
const selectedFiles = ref<File[]>([])
const ossFileCount = computed(() =>
  isPlus ? selectedFiles.value.length : fileList.value.length
)
const uploading = ref(false)
const results = ref<{ name: string; ok: boolean; url?: string; error?: string }[]>([])

const bankFile = ref<File | null>(null)
const bankUploading = ref(false)
const bankUrl = ref('')

/** 5+ 下用系统文件选择框多选；非 5+ 用 el-upload */
async function onPickOss() {
  try {
    const files = await pickFiles('*/*', true)
    if (files.length) selectedFiles.value = files
  } catch (e: any) {
    logError('onPickOss', e)
    ElMessage.error('选择文件失败：' + formatError(e))
  }
}

async function onPickBank() {
  try {
    const files = await pickFiles('*/*', false)
    bankFile.value = files[0] || null
  } catch (e: any) {
    logError('onPickBank', e)
    ElMessage.error('选择文件失败：' + formatError(e))
  }
}

function onBankChange(uploadFile: UploadFile) {
  bankFile.value = (uploadFile.raw as File) || null
}

async function doUpload() {
  if (!auth.token) {
    ElMessage.warning('请先登录')
    return
  }
  const files = isPlus
    ? selectedFiles.value
    : fileList.value.map((f) => f.raw as File).filter(Boolean)
  if (files.length === 0) return
  uploading.value = true
  results.value = []
  try {
    const userId = await fetchUserId()
    for (const file of files) {
      try {
        const url = await uploadFile(file, userId, fc.value, '', file.name)
        results.value.push({ name: file.name, ok: true, url })
      } catch (e: any) {
        results.value.push({ name: file.name, ok: false, error: e.message || String(e) })
      }
    }
    ElMessage.success('上传完成')
  } catch (e: any) {
    ElMessage.error('上传失败：' + (e.message || e))
  } finally {
    uploading.value = false
  }
}

async function doBankUpload() {
  if (!auth.token) {
    ElMessage.warning('请先登录')
    return
  }
  if (!bankFile.value) return
  bankUploading.value = true
  bankUrl.value = ''
  try {
    const userId = await fetchUserId()
    bankUrl.value = await uploadFile(bankFile.value, userId, 'study_v2', '', bankFile.value.name)
    ElMessage.success('题库上传成功')
  } catch (e: any) {
    ElMessage.error('上传失败：' + (e.message || e))
  } finally {
    bankUploading.value = false
  }
}
</script>

<style scoped>
.dev-page {
  max-width: 880px;
  margin: 0 auto;
}
.mb {
  margin-bottom: 16px;
}
.block {
  margin-bottom: 16px;
}
.uploader {
  width: 100%;
}
/* 5+ 下替代 el-upload 的可点击选择区，外观与拖拽区一致 */
.file-drop {
  width: 100%;
  padding: 36px 0;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease;
}
.file-drop:hover {
  border-color: var(--el-color-primary);
}
.upload-icon {
  font-size: 44px;
  color: var(--el-text-color-placeholder);
  margin-bottom: 8px;
}
.results {
  margin-top: 16px;
}
.results-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}
.r-name {
  min-width: 120px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.r-url {
  flex: 1;
  min-width: 200px;
}
.r-err {
  color: var(--el-color-danger);
  font-size: 12px;
}
.bank-url {
  margin-top: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
}
.muted code {
  background: var(--el-fill-color-light);
  padding: 1px 6px;
  border-radius: 4px;
}
@media (max-width: 767px) {
  .dev-page {
    padding: 0 4px;
  }
}
</style>

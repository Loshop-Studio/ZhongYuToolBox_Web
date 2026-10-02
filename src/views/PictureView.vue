<template>
  <div class="picture-page">
    <el-tabs v-model="activeTab" class="picture-tabs">
      <!-- 正常图库 -->
      <el-tab-pane label="图库" name="normal">
        <div class="section-bar">
          <el-button
            v-if="isPlus"
            type="primary"
            :icon="Upload"
            :loading="uploading"
            @click="onPickImage"
          >
            {{ uploading ? '上传中...' : '上传图片' }}
          </el-button>
          <el-upload
            v-else
            :show-file-list="false"
            accept="image/*"
            :before-upload="beforeUpload"
            :disabled="uploading"
          >
            <el-button type="primary" :icon="Upload" :loading="uploading">
              {{ uploading ? '上传中...' : '上传图片' }}
            </el-button>
          </el-upload>
        </div>

        <el-empty v-if="!loading.normal && !normal.loadingMore && normal.items.length === 0" description="暂无图片" />
        <div v-else class="grid-scroll">
          <div class="pic-grid">
            <div
              v-for="item in normal.items"
              :key="item.id"
              class="pic-cell"
              @click="openDetail(item)"
            >
              <el-image :src="proxyImgSrc(item.picture)" fit="cover" class="pic-img" lazy>
                <template #error>
                  <div class="pic-ph"><el-icon><Picture /></el-icon></div>
                </template>
              </el-image>
              <el-button
                v-if="item.id != null"
                class="cell-action"
                type="danger"
                size="small"
                :icon="Delete"
                circle
                plain
                :loading="busyIds.has(item.id)"
                aria-label="删除图片"
                @click.stop="confirmTrash(item)"
              />
            </div>
          </div>
          <div class="load-more">
            <el-icon v-if="normal.loadingMore" class="rotating"><Loading /></el-icon>
            <span v-else-if="!normal.finished">加载更多...</span>
            <span v-else class="muted">没有更多了</span>
          </div>
        </div>
      </el-tab-pane>

      <!-- 回收站 -->
      <el-tab-pane label="回收站" name="recycle">
        <el-empty v-if="!loading.recycle && !recycle.loadingMore && recycle.items.length === 0" description="回收站为空" />
        <div v-else class="grid-scroll">
          <div class="pic-grid">
            <div
              v-for="item in recycle.items"
              :key="item.id"
              class="pic-cell"
              @click="openDetail(item)"
            >
              <el-image :src="proxyImgSrc(item.picture)" fit="cover" class="pic-img" lazy>
                <template #error>
                  <div class="pic-ph"><el-icon><Picture /></el-icon></div>
                </template>
              </el-image>
              <el-button
                v-if="item.id != null"
                class="cell-action"
                type="danger"
                size="small"
                :icon="DeleteFilled"
                circle
                plain
                :loading="busyIds.has(item.id)"
                aria-label="彻底删除"
                @click.stop="confirmHardDelete(item)"
              />
            </div>
          </div>
          <div class="load-more">
            <el-icon v-if="recycle.loadingMore" class="rotating"><Loading /></el-icon>
            <span v-else-if="!recycle.finished">加载更多...</span>
            <span v-else class="muted">没有更多了</span>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Picture, Loading, Delete, DeleteFilled } from '@element-plus/icons-vue'
import { getPictures, addPicture, movePicturesToRecycleBin, deletePictures, formatFileSize, type PictureItem } from '@/api/picture'
import { uploadFile, fetchUserId, generateNonce } from '@/utils/oss'
import { proxyImgSrc } from '@/utils/proxy'
import { isPlus, pickImages } from '@/utils/plusPicker'
import { formatError, logError } from '@/utils/errorText'

const router = useRouter()
const PAGE_SIZE = 12

const activeTab = ref<'normal' | 'recycle'>('normal')
const uploading = ref(false)
const busyIds = reactive(new Set<string | number>())

function removeItemById(key: 'normal' | 'recycle', id: string | number) {
  const s = sectionOf(key)
  const idx = s.items.findIndex(it => it.id === id)
  if (idx >= 0) {
    s.items.splice(idx, 1)
    s.total = Math.max(0, s.total - 1)
    if (s.skip > 0) s.skip -= 1
  }
}

async function confirmTrash(item: PictureItem) {
  if (item.id == null) return
  const name = item.name || '该图片'
  try {
    await ElMessageBox.confirm(
      `确定要把「${name}」移入回收站吗？\n（可在回收站彻底删除，移入回收站可被官方客户端恢复）`,
      '移入回收站',
      { type: 'warning', confirmButtonText: '移入回收站', cancelButtonText: '取消' }
    )
  } catch { return }
  if (busyIds.has(item.id)) return
  busyIds.add(item.id)
  try {
    await movePicturesToRecycleBin([item.id])
    ElMessage.success('已移入回收站')
    removeItemById('normal', item.id)
  } catch (e: any) {
    logError('confirmTrash', e)
    ElMessage.error('移入回收站失败：' + formatError(e))
  } finally {
    busyIds.delete(item.id)
  }
}

async function confirmHardDelete(item: PictureItem) {
  if (item.id == null) return
  const name = item.name || '该图片'
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除「${name}」吗？\n此操作不可恢复！`,
      '彻底删除',
      { type: 'warning', confirmButtonText: '彻底删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
    )
  } catch { return }
  if (busyIds.has(item.id)) return
  busyIds.add(item.id)
  try {
    await deletePictures([item.id])
    ElMessage.success('已彻底删除')
    removeItemById('recycle', item.id)
  } catch (e: any) {
    logError('confirmHardDelete', e)
    ElMessage.error('彻底删除失败：' + formatError(e))
  } finally {
    busyIds.delete(item.id)
  }
}

interface SectionState {
  items: PictureItem[]
  total: number
  skip: number
  loadingMore: boolean
  finished: boolean
}
const loading = reactive({ normal: false, recycle: false })
const normal = reactive<SectionState>({ items: [], total: 0, skip: 0, loadingMore: false, finished: false })
const recycle = reactive<SectionState>({ items: [], total: 0, skip: 0, loadingMore: false, finished: false })

function sectionOf(key: 'normal' | 'recycle'): SectionState {
  return key === 'normal' ? normal : recycle
}

function getScrollEl(): HTMLElement | null {
  return document.querySelector('.content') as HTMLElement | null
}

function onScroll() {
  const key = activeTab.value
  const s = sectionOf(key)
  if (s.loadingMore || s.finished) return
  const el = getScrollEl()
  if (!el) return
  const scrollTop = el.scrollTop
  const clientH = el.clientHeight
  const scrollH = el.scrollHeight
  if (scrollTop + clientH >= scrollH - 240) {
    loadMore(key).then(fillViewport)
  }
}

/** 若内容未填满可视区（无滚动条），自动续加载，直到填满或结束 */
function fillViewport() {
  const key = activeTab.value
  const s = sectionOf(key)
  if (s.loadingMore || s.finished) return
  const el = getScrollEl()
  if (!el) return
  if (el.scrollHeight <= el.clientHeight + 120) {
    loadMore(key).then(() => requestAnimationFrame(fillViewport))
  }
}

function openDetail(item: PictureItem) {
  router.push({
    path: '/picture/detail',
    query: {
      picture: item.picture,
      name: item.name,
      size: item.size,
      createTime: item.createTime,
      id: item.id,
      recycle: activeTab.value === 'recycle' ? '1' : ''
    }
  })
}

async function loadMore(key: 'normal' | 'recycle') {
  const s = sectionOf(key)
  if (s.loadingMore || s.finished) return
  s.loadingMore = true
  const isRecycle = key === 'recycle'
  try {
    const res = await getPictures(isRecycle, s.skip, PAGE_SIZE)
    const items = res.items || []
    const total = res.totalCount || 0
    s.items.push(...items)
    s.total = total
    s.skip += items.length
    if (s.items.length >= total) s.finished = true
  } catch (e: any) {
    ElMessage.error('加载失败：' + (e.message || e))
  } finally {
    s.loadingMore = false
  }
}

async function loadFirst(key: 'normal' | 'recycle') {
  loading[key] = true
  const s = sectionOf(key)
  s.items = []
  s.skip = 0
  s.finished = false
  await loadMore(key)
  loading[key] = false
  await nextTick()
  fillViewport()
}

function setupObserver() {
  getScrollEl()?.addEventListener('scroll', onScroll, { passive: true })
}
function teardownObservers() {
  getScrollEl()?.removeEventListener('scroll', onScroll)
}

/** 5+ 下点击「上传图片」：调系统相册选择，再逐个走 beforeUpload 上传 */
async function onPickImage() {
  try {
    const files = await pickImages({ multiple: true, maximum: 9 })
    if (!files.length) return
    for (const f of files) {
      await beforeUpload(f)
    }
  } catch (e: any) {
    logError('onPickImage', e)
    ElMessage.error('选择图片失败：' + formatError(e))
  }
}

async function beforeUpload(file: File) {
  uploading.value = true
  try {
    let userId: string
    try {
      userId = await fetchUserId()
    } catch (e: any) {
      ElMessage.warning('无法获取用户ID：' + formatError(e))
      return false
    }

    const url = await uploadFile(file, userId, 'note_v2', '', file.name)
    const sizeStr = formatFileSize(file.size)
    const parts = url.split('/')
    const nonce = parts[parts.length - 2] || generateNonce()

    await addPicture(url, nonce, sizeStr)
    ElMessage.success('上传成功')
    await loadFirst('normal')
  } catch (e: any) {
    logError('beforeUpload', e)
    ElMessage.error('上传失败：' + formatError(e))
  } finally {
    uploading.value = false
  }
  return false
}

watch(activeTab, async (tab) => {
  const key = tab as 'normal' | 'recycle'
  if (sectionOf(key).items.length === 0) {
    await loadFirst(key)
  } else {
    await nextTick()
    fillViewport()
  }
})

onMounted(async () => {
  await loadFirst('normal')
  await loadFirst('recycle')
  await nextTick()
  setupObserver()
  fillViewport()
})

onBeforeUnmount(() => {
  teardownObservers()
})
</script>

<style scoped>
.picture-page {
  max-width: 1100px;
  margin: 0 auto;
}
.picture-tabs {
  --el-tabs-header-height: 48px;
}
.section-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.grid-scroll {
  min-height: 200px;
}
.pic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.pic-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.pic-cell:hover {
  transform: scale(1.03);
}
.cell-action {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 1;
}
.pic-cell:hover .cell-action,
.pic-cell:focus-within .cell-action {
  opacity: 1;
  transform: scale(1);
}
/* 触屏与未悬停时也始终可见，避免移动端没法触发 */
@media (hover: none), (max-width: 767px) {
  .cell-action {
    opacity: 0.85;
    transform: scale(0.85);
  }
}
.pic-img {
  width: 100%;
  height: 100%;
  display: block;
}
.pic-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--el-text-color-placeholder);
}
.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.load-more .muted {
  color: var(--el-text-color-placeholder);
}
.rotating {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 移动端适配 */
@media (max-width: 767px) {
  .picture-page {
    padding: 0 4px;
  }
  .pic-grid {
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 6px;
  }
  .pic-cell {
    border-radius: 6px;
  }
}
</style>

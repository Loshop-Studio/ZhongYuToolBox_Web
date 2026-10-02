<template>
  <div class="picture-page">
    <el-tabs v-model="activeTab" class="picture-tabs">
      <!-- 正常图库 -->
      <el-tab-pane label="图库" name="normal">
        <div class="section-bar">
          <el-checkbox :model-value="allSelected('normal')" :disabled="busy" @change="selectAll('normal', !!$event)">全选已加载</el-checkbox>
          <el-button :icon="Refresh" :disabled="busy" @click="loadFirst('normal')">刷新</el-button>
          <el-button :icon="Delete" :disabled="busy || !selected.normal.length" @click="changePictures('move')">移至回收站（{{ selected.normal.length }}）</el-button>
          <el-button
            v-if="isPlus"
            type="primary"
            :icon="Upload"
            :loading="uploading"
            :disabled="busy"
            @click="onPickImage"
          >
            {{ uploading ? '上传中...' : '上传图片' }}
          </el-button>
          <el-upload
            v-else
            :show-file-list="false"
            accept="image/*"
            :before-upload="beforeUpload"
            :disabled="busy"
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
            >
              <el-checkbox v-model="selected.normal" :value="String(item.id)" class="pic-selection" :disabled="busy" :aria-label="'选择图片 ' + item.name" />
              <el-image :src="proxyImgSrc(item.picture)" fit="cover" class="pic-img" lazy @click="openDetail(item)">
                <template #error>
                  <div class="pic-ph"><el-icon><Picture /></el-icon></div>
                </template>
              </el-image>
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
        <div class="section-bar">
          <el-checkbox :model-value="allSelected('recycle')" :disabled="busy" @change="selectAll('recycle', !!$event)">全选已加载</el-checkbox>
          <el-button :icon="Refresh" :disabled="busy" @click="loadFirst('recycle')">刷新</el-button>
          <el-button :disabled="busy || !selected.recycle.length" @click="changePictures('recover')">恢复选中（{{ selected.recycle.length }}）</el-button>
          <el-button type="danger" :icon="Delete" :disabled="busy || !selected.recycle.length" @click="changePictures('delete')">永久删除（{{ selected.recycle.length }}）</el-button>
        </div>
        <p class="muted">恢复后图片回到图库；永久删除无法撤销，操作前会再次确认。</p>
        <el-empty v-if="!loading.recycle && !recycle.loadingMore && recycle.items.length === 0" description="回收站为空" />
        <div v-else class="grid-scroll">
          <div class="pic-grid">
            <div
              v-for="item in recycle.items"
              :key="item.id"
              class="pic-cell"
            >
              <el-checkbox v-model="selected.recycle" :value="String(item.id)" class="pic-selection" :disabled="busy" :aria-label="'选择回收站图片 ' + item.name" />
              <el-image :src="proxyImgSrc(item.picture)" fit="cover" class="pic-img" lazy @click="openDetail(item)">
                <template #error>
                  <div class="pic-ph"><el-icon><Picture /></el-icon></div>
                </template>
              </el-image>
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Picture, Loading, Refresh, Delete } from '@element-plus/icons-vue'
import { getPictures, addPicture, formatFileSize, movePicturesToRecycleBin, recoverPictures, deleteRecycledPictures, type PictureItem } from '@/api/picture'
import { accountKey } from '@/utils/localData'
import { useAuthStore } from '@/stores/auth'
import { uploadFile, fetchUserId, generateNonce } from '@/utils/oss'
import { proxyImgSrc } from '@/utils/proxy'
import { isPlus, pickImages } from '@/utils/plusPicker'
import { formatError, logError } from '@/utils/errorText'

const router = useRouter()
const PAGE_SIZE = 12

const activeTab = ref<'normal' | 'recycle'>('normal')
const uploading = ref(false)
const selected = reactive({ normal: [] as string[], recycle: [] as string[] })
const mutating = ref(false), busy = computed(() => mutating.value || uploading.value)
const auth = useAuthStore()
let disposed = false, mutationController: AbortController | undefined
const generation = { normal: 0, recycle: 0 }

function allSelected(key: 'normal' | 'recycle') {
  const items = sectionOf(key).items
  return !!items.length && items.every(item => selected[key].includes(String(item.id)))
}
function selectAll(key: 'normal' | 'recycle', value: boolean) {
  selected[key] = value ? sectionOf(key).items.map(item => String(item.id)) : []
}
async function changePictures(action: 'move' | 'recover' | 'delete') {
  if (busy.value) return
  const key = action === 'move' ? 'normal' : 'recycle', ids = [...selected[key]]
  if (!ids.length) return
  const currentAccount = accountKey()
  mutating.value = true
  const controller = mutationController = new AbortController()
  try {
    const verb = action === 'move' ? '移至回收站' : action === 'recover' ? '恢复' : '永久删除'
    await ElMessageBox.confirm(`确定${verb}选中的 ${ids.length} 张图片？${action === 'delete' ? '永久删除无法撤销。' : ''}`, verb, {
      type: action === 'delete' ? 'warning' : 'info', confirmButtonText: verb, cancelButtonText: '取消'
    })
    if (disposed || controller.signal.aborted || currentAccount !== accountKey()) throw new Error('操作已取消或账号已切换')
    const mutate = action === 'move' ? movePicturesToRecycleBin : action === 'recover' ? recoverPictures : deleteRecycledPictures
    await mutate(ids, controller.signal)
    if (!disposed) { selected[key] = []; ElMessage.success(verb + '成功'); await loadFirst('normal'); await loadFirst('recycle') }
  } catch (e) { if (!disposed && e !== 'cancel' && e !== 'close') ElMessage.error('操作失败：' + formatError(e)) }
  finally { mutating.value = false; if (mutationController === controller) mutationController = undefined }
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
  if (disposed) return
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
      id: item.id
    }
  })
}

async function loadMore(key: 'normal' | 'recycle') {
  if (disposed) return
  const s = sectionOf(key)
  if (s.loadingMore || s.finished) return
  s.loadingMore = true
  const isRecycle = key === 'recycle'
  const current = generation[key]
  try {
    const res = await getPictures(isRecycle, s.skip, PAGE_SIZE)
    if (disposed || current !== generation[key]) return
    const items = res.items || []
    const total = res.totalCount || 0
    s.items.push(...items)
    s.total = total
    s.skip += items.length
    if (!items.length || s.items.length >= total) s.finished = true
  } catch (e: any) {
    if (disposed || current !== generation[key]) return
    s.finished = true
    ElMessage.error('加载失败：' + (e.message || e))
  } finally {
    if (current === generation[key]) s.loadingMore = false
  }
}

async function loadFirst(key: 'normal' | 'recycle') {
  generation[key]++
  loading[key] = true
  const s = sectionOf(key)
  selected[key] = []; s.loadingMore = false
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
  if (busy.value) return
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
  if (busy.value || disposed) return false
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
  disposed = true; mutationController?.abort()
  teardownObservers()
})
watch(() => [auth.userId, auth.apiBaseUrl], () => {
  mutationController?.abort()
  generation.normal++; generation.recycle++
  selected.normal = []; selected.recycle = []; normal.items = []; recycle.items = []
  void loadFirst('normal'); void loadFirst('recycle')
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
.pic-selection { position: absolute; z-index: 2; top: 4px; left: 4px; margin: 0; padding: 0 8px; border-radius: 6px; background: var(--el-bg-color-overlay); }
.section-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.section-bar .el-button { margin-left: 0; }
.pic-cell:hover {
  transform: scale(1.03);
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

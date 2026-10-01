<template>
  <div class="share-page">
    <el-alert title="本地文件分享：内容在本机打包，不发送账号 Token 给分享服务器。收件人导入 .zytbshare 文件即可查看；文件副本无法限制查看次数。" type="info" :closable="false" class="block" />
    <el-tabs v-model="activeTab" class="share-tabs">
      <!-- ===== 创建分享 ===== -->
      <el-tab-pane label="创建分享" name="create">
        <el-form :model="form" label-position="top" class="create-form" @submit.prevent>
          <el-form-item label="资源类型">
            <el-select v-model="form.resourceType" placeholder="选择资源类型" style="width: 100%">
              <el-option label="错题" value="mistake" />
              <el-option label="新测评" value="evaluation" />
              <el-option label="优客课程" value="course" />
              <el-option label="优客章节" value="chapter" />
              <el-option label="随身答" value="quora" />
              <el-option label="云笔记" value="note" />
              <el-option label="笔记文件夹" value="note_folder" />
            </el-select>
          </el-form-item>
          <el-form-item label="资源 ID">
            <el-input v-model="form.resourceId" placeholder="如错题 itemId / 课程 courseId / 章节 catalogId" clearable />
          </el-form-item>
          <el-form-item label="章节 ID（仅优客章节需要）">
            <el-input v-model="form.chapterId" placeholder="选填" clearable />
          </el-form-item>
          <el-form-item label="标题">
            <el-input v-model="form.title" placeholder="留空则使用默认标题" clearable />
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="访问密码（选填）">
                <el-input v-model="form.password" type="password" show-password placeholder="不设则公开" clearable />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="有效期（小时，0 为永久）">
                <el-input-number v-model="form.expiresHours" :min="0" :max="8760" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-button type="primary" :loading="creating" @click="doCreate">生成本地分享文件</el-button>

          <el-alert
            v-if="createdUrl"
            type="success"
            :closable="false"
            show-icon
            class="create-result"
          >
            <template #title>本地分享文件已生成</template>
            <div class="result-box">
              <el-input :model-value="createdUrl" readonly />
              <el-button type="primary" @click="saveShareFile(createdUrl)">保存分享文件</el-button>
              <el-button @click="startViewById(createdUrl)">预览</el-button>
            </div>
          </el-alert>
        </el-form>
      </el-tab-pane>

      <!-- ===== 我的分享 ===== -->
      <el-tab-pane label="我的分享" name="mine">
        <div class="mine-header">
          <span class="muted">分享内容仅保存在本机</span>
          <el-button text :icon="Refresh" :loading="loadingMine" @click="loadMine">刷新</el-button>
        </div>
        <div v-loading="loadingMine" class="mine-list">
          <el-empty v-if="!loadingMine && mine.length === 0" description="暂无分享" />
          <el-card
            v-for="item in mine"
            :key="item.share_id"
            class="mine-card"
            shadow="hover"
          >
            <div class="mine-card-body">
              <div class="mine-meta">
                <div class="mine-title" :title="item.title">{{ item.title || item.resource_type }}</div>
                <div class="mine-sub">
                  <el-tag size="small">{{ typeLabel(item.resource_type) }}</el-tag>
                  <span v-if="item.has_password" class="pwd-flag">
                    <el-icon><Lock /></el-icon> 加密
                  </span>
                </div>
                <div class="mine-sub muted">{{ item.created_at }}</div>
              </div>
              <div class="mine-actions">
                <el-button size="small" @click="saveShareFile(item.share_id)">保存文件</el-button>
                <el-button size="small" :icon="Link" @click="openShareView(item.share_id)">查看</el-button>
                <el-button size="small" type="danger" plain :icon="Delete" @click="removeShare(item)">删除</el-button>
              </div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- ===== 查看分享 ===== -->
      <el-tab-pane label="查看分享" name="view">
        <div class="view-hint muted">
          导入分享文件，或输入本机已有分享 ID。旧服务器上的分享 ID 不能离线恢复。
          <input type="file" accept=".zytbshare" aria-label="导入分享文件" @change="loadShareFile" />
        </div>
        <div class="view-input">
          <el-input v-model="manualId" placeholder="输入分享 ID" clearable @keyup.enter="startViewById(manualId)">
            <template #append>
              <el-button :icon="Search" @click="startViewById(manualId)">加载</el-button>
            </template>
          </el-input>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 密码校验弹窗 -->
    <el-dialog v-model="pwdVisible" title="此内容已加密" width="380px" :close-on-click-modal="false">
      <el-input
        v-model="pwdInput"
        type="password"
        show-password
        placeholder="请输入分享密码"
        @keyup.enter="submitPwd"
      />
      <div v-if="pwdError" class="pwd-error">{{ pwdError }}</div>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="submitPwd">解锁</el-button>
      </template>
    </el-dialog>

    <!-- 分享内容查看弹窗 -->
    <el-dialog
      v-model="contentVisible"
      :title="contentMeta.title || '分享内容'"
      width="860px"
      top="5vh"
      class="share-content-dialog"
    >
      <div v-loading="contentLoading" class="share-content">
        <template v-if="!contentLoading && content">
          <!-- 错题 -->
          <template v-if="isType('mistake')">
            <el-card v-if="content.stem" class="block" header="题目">
              <div class="html" v-html="content.stem" />
            </el-card>
            <el-card v-if="content.answers" class="block" header="答案">
              <div class="html" v-html="content.answers" />
            </el-card>
            <el-card v-if="content.analysis && content.analysis.length" class="block" header="解析">
              <div class="html" v-html="content.analysis.join('<hr>')" />
            </el-card>
            <el-card v-if="content.note_screenshot" class="block" header="笔记截图">
              <el-image :src="content.note_screenshot" fit="contain" class="note-img"
                :preview-src-list="[content.note_screenshot]" preview-teleported hide-on-click-modal />
            </el-card>
            <el-card v-if="content.pictureNote && content.pictureNote.length" class="block" header="图片笔记">
              <div class="pic-grid">
                <el-image
                  v-for="(u, i) in content.pictureNote"
                  :key="i"
                  :src="u"
                  fit="contain"
                  class="pic-item"
                  :preview-src-list="content.pictureNote"
                  :initial-index="i"
                  preview-teleported
                  hide-on-click-modal
                />
              </div>
            </el-card>
          </template>

          <!-- 课程 / 章节 -->
          <template v-else-if="isType('course') || isType('chapter')">
            <el-card class="block">
              <div v-if="content.description" class="muted desc">{{ content.description }}</div>
              <div class="html" v-html="content.content || '（无正文）'" />
            </el-card>
          </template>

          <!-- 随身答 -->
          <template v-else-if="isType('quora')">
            <el-card v-for="(m, i) in (content.items || [])" :key="i" class="block">
              <div class="quora-meta muted">
                {{ m.userName || '' }} · {{ m.sendTime || '' }}
              </div>
              <el-image v-if="m.snapShot" :src="m.snapShot" fit="contain" class="note-img"
                :preview-src-list="[m.snapShot]" preview-teleported hide-on-click-modal />
            </el-card>
          </template>

          <!-- 云笔记 / 笔记文件夹 -->
          <template v-else-if="isType('note') || isType('note_folder')">
            <template v-if="content.resourceList && content.resourceList.length">
              <el-card class="block">
                <div class="note-nav">
                  <el-button size="small" :disabled="notePageIdx <= 0" @click="notePageIdx--">上一页</el-button>
                  <span class="muted">第 {{ notePageIdx + 1 }} / {{ notePages.length }} 页</span>
                  <el-button size="small" :disabled="notePageIdx >= notePages.length - 1" @click="notePageIdx++">下一页</el-button>
                </div>
                <div class="note-page">
                  <el-image
                    v-for="(u, i) in currentNotePage"
                    :key="i"
                    :src="u"
                    fit="contain"
                    class="note-img"
                    :preview-src-list="currentNotePage"
                    :initial-index="i"
                    preview-teleported
                    hide-on-click-modal
                  />
                </div>
              </el-card>
            </template>
            <el-card v-else class="block">
              <pre class="json">{{ JSON.stringify(content, null, 2) }}</pre>
            </el-card>
          </template>

          <template v-else-if="isType('evaluation')">
            <el-card v-for="(question, index) in content.questions || []" :key="index" class="block" :header="`第 ${index + 1} 题`">
              <div class="html" v-html="question.stem" />
              <h4>答案与解析</h4><div class="html" v-html="question.answer + question.explanation" />
            </el-card>
          </template>
          <!-- 其它 -->
          <template v-else>
            <el-card class="block">
              <pre class="json">{{ JSON.stringify(content, null, 2) }}</pre>
            </el-card>
          </template>

          <div class="content-foot muted">
            由 {{ contentMeta.username || '用户' }} 分享 · 创建于 {{ contentMeta.created_at || '' }}
          </div>
        </template>
        <el-empty v-if="!contentLoading && !content" description="加载失败或内容为空" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CopyDocument,
  TopRight,
  Refresh,
  Link,
  Delete,
  Lock,
  Search
} from '@element-plus/icons-vue'
import {
  createShare,
  getShareInfo,
  accessShare,
  listMyShares,
  deleteShare, exportShare, importShare,
  type ShareResourceType,
  type ShareContent,
  type MyShareItem
} from '@/api/share'
import { useAuthStore } from '@/stores/auth'
import { API_BASE_URL } from '@/config'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const activeTab = ref('create')

/* ===== 创建分享 ===== */
const form = reactive({
  resourceType: 'mistake' as ShareResourceType,
  resourceId: '',
  chapterId: '',
  title: '',
  password: '',
  expiresHours: 0,
  maxViews: 0
})
const creating = ref(false)
const createdUrl = ref('')

async function doCreate() {
  if (!form.resourceId) {
    ElMessage.warning('请填写资源 ID')
    return
  }
  creating.value = true
  createdUrl.value = ''
  try {
    const res = await createShare({
      api_base: auth.apiBaseUrl || API_BASE_URL,
      resource_type: form.resourceType,
      resource_id: form.resourceId,
      chapter_id: form.chapterId,
      title: form.title,
      password: form.password,
      expires_hours: form.expiresHours,
      max_views: form.maxViews
    })
    createdUrl.value = res.share_id
    ElMessage.success('分享创建成功')
  } catch (e: any) {
    ElMessage.error('创建失败：' + (e.message || e))
  } finally {
    creating.value = false
  }
}

/* ===== 我的分享 ===== */
async function saveShareFile(id: string) {
  try { await exportShare(id); ElMessage.success('分享文件已保存') } catch (e) { ElMessage.error((e as Error).message) }
}
async function loadShareFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''; if (!file) return
  try { const id = await importShare(file); await startViewById(id) } catch (e) { ElMessage.error((e as Error).message) }
}
const mine = ref<MyShareItem[]>([])
const loadingMine = ref(false)

async function loadMine() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }
  loadingMine.value = true
  try {
    mine.value = await listMyShares()
  } catch (e: any) {
    ElMessage.error('加载失败：' + (e.message || e))
  } finally {
    loadingMine.value = false
  }
}

function typeLabel(t: ShareResourceType): string {
  return (
    {
      mistake: '错题',
      evaluation: '新测评',
      course: '优客课程',
      chapter: '优客章节',
      quora: '随身答',
      note: '云笔记',
      note_folder: '笔记文件夹'
    } as Record<string, string>
  )[t] || t
}

function openShareView(shareId: string) {
  router.push({ hash: `#share=${shareId}` })
}

async function removeShare(item: MyShareItem) {
  try {
    await ElMessageBox.confirm(`确认删除分享「${item.title || item.share_id}」？`, '删除确认', {
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    await deleteShare(item.share_id)
    ElMessage.success('已删除')
    loadMine()
  } catch (e: any) {
    ElMessage.error('删除失败：' + (e.message || e))
  }
}

/* ===== 查看分享 ===== */
const manualId = ref('')
const pwdVisible = ref(false)
const pwdInput = ref('')
const pwdError = ref('')
const pwdLoading = ref(false)
const contentVisible = ref(false)
const contentLoading = ref(false)
const content = ref<ShareContent | null>(null)
const currentShareId = ref('')

const contentMeta = computed(() => content.value?._meta || ({} as any))
const contentResourceType = computed(() => (contentMeta.value as any).resource_type as ShareResourceType)

function isType(t: ShareResourceType) {
  return contentResourceType.value === t
}

// 笔记图片分页
const notePageIdx = ref(0)
const notePages = computed<{ pageNum: number; urls: string[] }[]>(() => {
  const rl = content.value?.resourceList || []
  const IMG_RE = /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i
  const map: Record<number, { thumbnails: string[]; originals: string[] }> = {}
  for (const item of rl as any[]) {
    const ossUrl: string = item.ossImageUrl || item.url || ''
    if (!ossUrl || !IMG_RE.test(ossUrl)) continue
    const page = (item.pageIndex || 0) + 1
    if (!map[page]) map[page] = { thumbnails: [], originals: [] }
    const fullUrl = ossUrl.startsWith('http') ? ossUrl : 'http://friday-note.oss-cn-hangzhou.aliyuncs.com/' + ossUrl
    if (item.resourceType === 2) map[page].thumbnails.push(fullUrl)
    else map[page].originals.push(fullUrl)
  }
  const pages = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b)
  return pages.map((p) => ({
    pageNum: p,
    urls: map[p].thumbnails.length ? map[p].thumbnails : map[p].originals
  }))
})
const currentNotePage = computed(() => notePages.value[notePageIdx.value]?.urls || [])

watch(notePages, () => {
  notePageIdx.value = 0
})

async function startViewById(id: string) {
  const shareId = (id || '').trim()
  if (!shareId) {
    ElMessage.warning('请输入分享 ID')
    return
  }
  manualId.value = shareId
  currentShareId.value = shareId
  content.value = null
  contentVisible.value = true
  contentLoading.value = true
  try {
    const info = await getShareInfo(shareId)
    if (info.has_password) {
      contentLoading.value = false
      pwdInput.value = ''
      pwdError.value = ''
      pwdVisible.value = true
      return
    }
    await loadContent('')
  } catch (e: any) {
    contentLoading.value = false
    ElMessage.error('加载失败：' + (e.message || e))
  }
}

async function loadContent(password: string) {
  if (!currentShareId.value) return
  contentLoading.value = true
  try {
    content.value = await accessShare(currentShareId.value, password)
    pwdVisible.value = false
  } catch (e: any) {
    ElMessage.error('加载失败：' + (e.message || e))
  } finally {
    contentLoading.value = false
  }
}

async function submitPwd() {
  if (!pwdInput.value) {
    pwdError.value = '请输入密码'
    return
  }
  pwdLoading.value = true
  try {
    await loadContent(pwdInput.value)
    pwdError.value = ''
  } catch (e: any) {
    if ((e.message || '').includes('密码')) {
      pwdError.value = '密码错误，请重试'
    } else {
      pwdError.value = e.message || '加载失败'
    }
  } finally {
    pwdLoading.value = false
  }
}

/* ===== 工具 ===== */
function copyText(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => ElMessage.success('已复制'))
    .catch(() => ElMessage.error('复制失败'))
}
function openRaw(url: string) {
  window.open(url, '_blank')
}

/* ===== 启动：解析 #share= 自动加载 ===== */
onMounted(() => {
  const m = String(route.hash || '').match(/^#share=([a-f0-9]+)/i)
  if (m) {
    activeTab.value = 'view'
    startViewById(m[1])
  } else if (route.query.type && route.query.id) {
    // 从其它模块「分享」按钮跳转而来，预填表单
    const allowed = ['mistake', 'evaluation', 'course', 'chapter', 'quora', 'note', 'note_folder']
    const t = String(route.query.type)
    if (allowed.includes(t)) {
      form.resourceType = t as ShareResourceType
      form.resourceId = String(route.query.id)
      if (route.query.chapterId) form.chapterId = String(route.query.chapterId)
      if (route.query.title) form.title = String(route.query.title)
      activeTab.value = 'create'
    }
  }
  if (activeTab.value === 'mine') loadMine()
})

watch(
  () => route.hash,
  (h) => {
    const m = String(h || '').match(/^#share=([a-f0-9]+)/i)
    if (m) {
      activeTab.value = 'view'
      startViewById(m[1])
    }
  }
)
</script>

<style scoped>
.share-page {
  max-width: 960px;
  margin: 0 auto;
}
.create-form {
  max-width: 560px;
  padding-top: 8px;
}
.create-result {
  margin-top: 16px;
}
.result-box {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.mine-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.mine-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
}
.mine-card {
  border-radius: 8px;
}
.mine-card-body {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mine-meta {
  flex: 1;
  min-width: 0;
}
.mine-title {
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mine-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin-top: 4px;
}
.pwd-flag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--el-color-warning);
}
.mine-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.view-hint {
  font-size: 13px;
  margin-bottom: 12px;
}
.view-hint code {
  background: var(--el-fill-color-light);
  padding: 1px 6px;
  border-radius: 4px;
}
.view-input {
  max-width: 520px;
}
.pwd-error {
  color: var(--el-color-danger);
  font-size: 13px;
  margin-top: 8px;
}
.share-content {
  min-height: 200px;
}
.block {
  margin-bottom: 12px;
}
.html :deep(img) {
  max-width: 100%;
}
.desc {
  margin-bottom: 8px;
}
.note-img {
  max-width: 100%;
  max-height: 420px;
}
.pic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.pic-item {
  width: 100%;
  height: 120px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.note-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
}
.note-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.quora-meta {
  font-size: 12px;
  margin-bottom: 6px;
}
.json {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px;
  max-height: 500px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.content-foot {
  text-align: center;
  font-size: 12px;
  margin-top: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
}

@media (max-width: 767px) {
  .share-page {
    padding: 0 4px;
  }
  .mine-card-body {
    flex-direction: column;
    align-items: stretch;
  }
  .mine-actions {
    justify-content: flex-end;
  }
}
</style>

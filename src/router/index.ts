import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const Placeholder = () => import('@/views/PlaceholderView.vue')

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/login' },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '用户中心' }
  },
  {
    path: '/note',
    name: 'note',
    component: () => import('@/views/note/NoteView.vue'),
    meta: { title: '云笔记', keepAlive: true }
  },
  {
    path: '/note/:fileId',
    name: 'note-detail',
    component: () => import('@/views/note/NoteDetailView.vue'),
    meta: { title: '笔记预览', hideLayoutHeader: true, keepAlive: true }
  },
  { path: '/picture', name: 'picture', component: () => import('@/views/PictureView.vue'), meta: { title: '图库', keepAlive: true } },
  { path: '/picture/detail', name: 'picture-detail', component: () => import('@/views/PictureDetailView.vue'), meta: { title: '图片详情', hideLayoutHeader: true, keepAlive: true } },
  { path: '/mistake', name: 'mistake', component: () => import('@/views/MistakeView.vue'), meta: { title: '错题本', keepAlive: true } },
  { path: '/mistake/:itemId', name: 'mistake-detail', component: () => import('@/views/MistakeDetailView.vue'), meta: { title: '错题详情', hideLayoutHeader: true, keepAlive: true } },
  { path: '/quora', name: 'quora', component: () => import('@/views/QuoraView.vue'), meta: { title: '随身答', keepAlive: true } },
  { path: '/quora/:sessionId', name: 'quora-detail', component: () => import('@/views/QuoraDetailView.vue'), meta: { title: '问题详情', hideLayoutHeader: true, keepAlive: true } },
  { path: '/quora/:sessionId/board', name: 'quora-board', component: () => import('@/views/BoardView.vue'), meta: { title: '画板回复', hideLayoutHeader: true } },
  { path: '/exam', name: 'exam', component: () => import('@/views/ExamView.vue'), meta: { title: '新测评', keepAlive: true } },
  { path: '/exam/:taskId', name: 'exam-questions', component: () => import('@/views/ExamQuestionsView.vue'), meta: { title: '试题详情', hideLayoutHeader: true, keepAlive: true } },
  { path: '/exam/:taskId/overview', name: 'exam-overview', component: () => import('@/views/ExamOverviewView.vue'), meta: { title: '考试概览', hideLayoutHeader: true, keepAlive: true } },
  { path: '/exam/:taskId/analysis', name: 'exam-analysis', component: () => import('@/views/ExamAnalysisView.vue'), meta: { title: '题目分析', hideLayoutHeader: true, keepAlive: true } },
  { path: '/column', name: 'column', component: () => import('@/views/ColumnView.vue'), meta: { title: '在线专栏', hideLayoutHeader: true } },
  { path: '/column/:pageId', name: 'column-detail', component: () => import('@/views/ColumnDetailView.vue'), meta: { title: '文章详情', hideLayoutHeader: true } },

  { path: '/course', name: 'course', component: () => import('@/views/IframeViews.vue'), props: { kind: 'course' }, meta: { title: '选课', hideLayoutHeader: true } },
  {
    path: '/lesson',
    name: 'lesson',
    component: () => import('@/views/lesson/LessonCourseListView.vue'),
    meta: { title: '优客畅学', keepAlive: true }
  },
  {
    path: '/lesson/:courseId',
    name: 'lesson-catalog',
    component: () => import('@/views/lesson/LessonCatalogView.vue'),
    meta: { title: '优客畅学 · 章节', hideLayoutHeader: true, keepAlive: true }
  },
  {
    path: '/lesson/:courseId/:catalogId',
    name: 'lesson-chapter',
    component: () => import('@/views/lesson/LessonChapterView.vue'),
    meta: { title: '优客畅学 · 内容', hideLayoutHeader: true, keepAlive: true }
  },
  {
    path: '/lesson/viewer',
    name: 'lesson-viewer',
    component: () => import('@/views/lesson/LessonViewerView.vue'),
    meta: { title: '附件查看', hideLayoutHeader: true }
  },
  {
    path: '/linspirer',
    name: 'linspirer',
    component: () => import('@/views/linspirer/LinspirerView.vue'),
    meta: { title: '领创' }
  },
  { path: '/apps', name: 'app-downloads', component: () => import('@/views/AppDownloadsView.vue'), meta: { title: '中育应用下载' } },
  { path: '/dev', name: 'dev', component: () => import('@/views/DevelopView.vue'), meta: { title: '开发工具' } },
  { path: '/share', name: 'share', component: () => import('@/views/ShareView.vue'), meta: { title: '分享' } },
  { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue'), meta: { title: '说明&致谢' } },
  { path: '/donate', name: 'donate', component: () => import('@/views/DonateView.vue'), meta: { title: '支持作者' } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 未登录拦截（登录页除外）：
// 1. 如果本地保存了自动登录凭据（loginAccount + loginPassword），先尝试用凭据自动重新登录。
//    这样只要用户没主动注销，启动应用 / token 过期 / refreshToken 失效 时都会无缝续登。
// 2. 自动登录成功放行；失败才跳到 /login，由用户手动重新登录。
// 3. /login、/about、/donate、/apps 公开可访问，不强制登录。
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const publicPages = ['/login', '/about', '/donate', '/apps']
  const isPublic = publicPages.includes(to.path)
  if (auth.isLoggedIn) return true
  if (isPublic) return true
  // 有凭据就走一次自动登录；失败则跳登录页
  if (localStorage.getItem('loginAccount') && localStorage.getItem('loginPassword')) {
    const ok = await auth.autoRelogin()
    if (ok) return true
  }
  return { path: '/login' }
})

export default router

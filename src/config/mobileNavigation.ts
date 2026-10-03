export type MobileGroup = 'resources' | 'assessment' | 'questions' | 'me'
export const mobileGroups = [
  { key: 'resources', label: '资源', path: '/resources', description: '笔记、专栏与课程，放在一起。', icon: 'M4 5h6l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 5v9h16v-9H4Z' },
  { key: 'assessment', label: '测评', path: '/assessment', description: '完成作业，整理每一道错题。', icon: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2 4v2h8V6H8Zm2.2 11.4 6.4-6.4-1.4-1.4-5 5-2.4-2.4L6.4 14l3.8 3.4Z' },
  { key: 'questions', label: '问答', path: '/questions', description: '把疑问说清楚，一起找到答案。', icon: 'M12 2C6.5 2 2 6 2 11c0 2.7 1.3 5.2 3.5 6.8L4 22l5.6-2.3c.8.2 1.6.3 2.4.3 5.5 0 10-4 10-9S17.5 2 12 2ZM7 10h2v2H7v-2Zm4 0h2v2h-2v-2Zm4 0h2v2h-2v-2Z' },
  { key: 'me', label: '我的', path: '/me', description: '你的账号，以及工具箱的其他功能。', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 13a7 7 0 0 1-5.7-2.9C7.2 14.8 9.4 14 12 14s4.8.8 5.7 2.1A7 7 0 0 1 12 19Z' }
] as const
export const resourceSections = [
  { key: 'note', label: '笔记', path: '/note', title: '云笔记', description: '把 PDF 和图片整理成笔记，学习资料随时找得到。', icon: 'Document' },
  { key: 'column', label: '专栏', path: '/column', title: '在线专栏', description: '浏览学校专栏，阅读文章和课程资料。', icon: 'Reading' },
  { key: 'lesson', label: '课程', path: '/lesson', title: '课程学习', description: '浏览优课畅学课程与章节，或进入学校选课。', icon: 'VideoPlay' }
] as const
export const assessmentSections = [
  { key: 'exam', label: '作业', path: '/exam', title: '作业与测评', description: '查看作业、题目分析，自动识别本人错题。', icon: 'EditPen' },
  { key: 'mistake', label: '错题本', path: '/mistake', title: '官方错题本', description: '按科目整理错题，导出题目在前、答案在后的打印 PDF。', icon: 'Notebook' }
] as const
export const personalTools = [
  { label: '图库', description: '图片与回收站', path: '/picture', icon: 'Picture', section: '工具' },
  { label: '中育应用下载', description: '为 Android 平板获取官方 APK', path: '/apps', icon: 'Download', section: '工具' },
  { label: '领创', description: '设备与应用管理', path: '/linspirer', icon: 'Monitor', section: '工具' },
  { label: '高级选项', description: '服务地址与更多设置', path: '/advance', icon: 'Setting', section: '工具' },
  { label: '开发工具', description: '上传与接口工具', path: '/dev', icon: 'Tools', section: '工具' },
  { label: '分享', description: '分享你的学习资源', path: '/share', icon: 'Share', section: '工具' },
  { label: '加速插件', description: '桌面端辅助插件说明', path: '/proxy', icon: 'Connection', section: '工具' },
  { label: '关于应用', description: '检查更新、支持作者、说明与致谢', path: '/about', icon: 'InfoFilled', section: '项目' }
] as const
export function mobileGroupForPath(path: string): MobileGroup {
  const root = '/' + path.split(/[/?#]/).filter(Boolean)[0]
  if (['/resources', '/note', '/column', '/lesson', '/course'].includes(root)) return 'resources'
  if (['/assessment', '/exam', '/mistake'].includes(root)) return 'assessment'
  if (['/questions', '/quora'].includes(root)) return 'questions'
  return 'me'
}
export function mobileSectionForPath(path: string, query?: unknown): string {
  const root = path.split('/')[1]
  if (root === 'resources') return resourceSections.some(s => s.key === query) ? String(query) : 'note'
  if (root === 'assessment') return assessmentSections.some(s => s.key === query) ? String(query) : 'exam'
  return root === 'course' ? 'lesson' : root
}

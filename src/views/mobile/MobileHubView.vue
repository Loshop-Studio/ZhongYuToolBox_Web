<template>
  <section class="ios-hub">
    <div class="ios-hub-art" aria-hidden="true"><div class="ios-hub-orbit"></div><div class="ios-hub-sheet sheet-back"></div><div class="ios-hub-sheet"><el-icon><component :is="current.icon" /></el-icon><i></i><i></i></div><span class="ios-art-spark">✦</span></div>
    <div class="ios-hub-copy"><span class="ios-eyebrow">{{ group === 'resources' ? '你的学习资料' : group === 'assessment' ? '每一次练习，都有收获' : '学习中的疑问，有处可问' }}</span>
      <h2>{{ current.title }}</h2><p>{{ current.description }}</p>
      <button class="ios-primary-action" @click="open(current.path)">登录后{{ group === 'resources' ? '查看资源' : group === 'assessment' ? '查看测评' : '进入问答' }} <el-icon><ArrowRight /></el-icon></button>
      <button v-if="current.path === '/lesson'" class="ios-text-action" @click="open('/course')">进入学校选课 <el-icon><TopRight /></el-icon></button>
    </div>
    <div class="ios-hub-guide"><h3>{{ current.title }}里可以做什么</h3><div v-for="(line, i) in guide" :key="line"><span>0{{ i + 1 }}</span><p>{{ line }}</p></div></div>
    <p class="ios-hub-footnote">使用你的中育账号登录，数据来自学校官方服务。</p>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { resourceSections, assessmentSections, mobileSectionForPath, type MobileGroup } from '@/config/mobileNavigation'
const props = defineProps<{ group: MobileGroup }>()
const route = useRoute(), router = useRouter()
const current = computed(() => {
  if (props.group === 'questions') return { title: '随身答', description: '浏览学科问题，查看讨论与回复，把思路和图片一起分享。', path: '/quora', icon: 'ChatDotRound' }
  const items = props.group === 'resources' ? resourceSections : assessmentSections
  return items.find(s => s.key === mobileSectionForPath(route.path, route.query.section)) || items[0]
})
const guides: Record<string, string[]> = {
  '/note': ['按文件夹浏览、搜索和预览云笔记。', 'PDF 或图片在本机整理后，多文件一起上传。', '重命名、批量移动，管理笔记回收站。'],
  '/column': ['浏览学校的学科专栏和文章。', '查看订阅、讨论与最新资料。', '预览并保存需要的资源附件。'],
  '/lesson': ['选择课程，按章节浏览学习内容。', '查看课程附件与学习资源。', '从课程区进入学校选课。'],
  '/exam': ['浏览作业与测评，查看题目分析。', '已完成作业自动识别本人错题。', '将错题批量加入中育官方错题本。'],
  '/mistake': ['按科目浏览，单独选择要复习的题目。', '导出全部或选中题目，题目和答案分区排版。', '管理中育官方错题本中的题目。'],
  '/quora': ['按学科浏览问题和讨论。', '查看题目图片、回复与解题思路。', '用文字或图片参与问答。']
}
const guide = computed(() => guides[current.value.path])
function open(path: string) { router.push({ path: '/login', query: { redirect: path } }) }
</script>

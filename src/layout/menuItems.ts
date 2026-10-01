/**
 * 侧边菜单项配置（对应旧 index.html #sidebarMenu）
 */
import {
  Menu as MenuIcon,
  User,
  Picture,
  Document,
  Notebook,
  ChatDotRound,
  EditPen,
  Monitor,
  School,
  Reading,
  Present,
  Tools,
  Download,
  Setting,
  Coffee,
  InfoFilled,
  Crop
} from '@element-plus/icons-vue'
import type { Component } from 'vue'

export interface MenuItem {
  index: string
  title: string
  icon: Component
}

export const MENU_ITEMS: MenuItem[] = [
  { index: '/donate', title: '支持作者', icon: Coffee },
  { index: '/login', title: '用户中心', icon: User },
  { index: '/picture', title: '图库', icon: Picture },
  { index: '/note', title: '云笔记', icon: Document },
  { index: '/exam', title: '新测评', icon: EditPen },
  { index: '/column', title: '在线专栏', icon: Monitor },
  { index: '/course', title: '选课', icon: School },
  { index: '/mistake', title: '错题本', icon: Notebook },
  { index: '/quora', title: '随身答', icon: ChatDotRound },
  { index: '/linspirer', title: '领创', icon: Present },
  { index: '/apps', title: '中育应用下载', icon: Download },
  { index: '/lesson', title: '优客畅学', icon: Reading },
  { index: '/advance', title: '高级选项', icon: Setting },
  { index: '/dev', title: '开发工具', icon: Tools },
  { index: '/proxy', title: '下载加速插件', icon: Download },
  { index: '/about', title: '说明&致谢', icon: InfoFilled }
]

<template>
  <div class="about-page">
    <el-card class="block" header="使用说明">
      <section class="usage">
        <h3>云笔记</h3>
        <p class="muted">搜索、预览和下载云笔记中的原始图片和附件。</p>
        <ul>
          <li>在搜索框中输入笔记名称关键词进行搜索</li>
          <li>支持文件夹视图浏览和分页加载</li>
          <li>点击笔记即可下载原始图片压缩包</li>
          <li>支持 <strong>PDF 上传</strong> 转存到云笔记</li>
          <li>Windows 版支持多张 PNG、JPG、WebP 图片在本机合成 PDF 后上传，可调整页面顺序。</li>
          <li>图片与 PDF 均可使用“旋转”下拉框统一设置方向：不旋转 / 顺时针 90° / 逆时针 90° / 180°，原文件不被修改。</li>
          <li>笔记列表支持重命名、批量移动文件夹和移至中育官方回收站；回收站支持查看、单条和批量永久删除。恢复请使用官方客户端。</li>

        </ul>

        <h3>中育应用下载</h3>
        <ul>
          <li>从当前学校的官方学生端更新接口查询应用，可下载优课畅学等常用应用，也可输入完整 Android 包名查询。</li>
          <li>下载后在本地检查 APK 结构与大小并显示 SHA-256；安装及课程访问仍由平板设置和账号权限决定。</li>
        </ul>

        <h3>在线专栏</h3>
        <p class="muted">浏览中育课程章节内容。</p>
        <ul>
          <li>选择课程后自动加载章节列表</li>
          <li>点击章节即可在线预览内容</li>
          <li>支持 <strong>下载源文件</strong>（视频、文档等）</li>
          <li>遇到渲染问题可点击"手动渲染"按钮重试</li>
        </ul>

        <h3>错题本</h3>
        <p class="muted">查看、筛选和下载错题笔记。</p>
        <ul>
          <li>按学科和分类筛选错题合集</li>
          <li>点击错题可预览笔记图片和原始文件</li>
          <li>支持下载错题笔记压缩包</li>
          <li>可导出选中题目或本科全部错题为 A4 PDF。全部题目先编号列出，答案与解析另起一页，正文为思源宋体约 12 磅，紧凑排版，长题自动分页。</li>
        </ul>

        <h3>随身答</h3>
        <p class="muted">浏览和回复问答内容。</p>
        <ul>
          <li>按学科和分类筛选问答列表</li>
          <li>点击问题进入详情，查看图片和回复</li>
          <li>支持 <strong>回复功能</strong>，可直接提交答案</li>
          <li>支持下载完整图片压缩包</li>
        </ul>

        <h3>优课畅学</h3>
        <p class="muted">浏览课程资源和在线学习。</p>
        <ul>
          <li>选择学科和课程后即可进入学习</li>
          <li>支持 <strong>选课功能</strong></li>
          <li>支持课程分享</li>
        </ul>

        <h3>下载应用</h3>
        <p class="muted">获取中育官方 App 安装包。</p>
        <ul>
          <li>选择对应的应用链接下载 APK</li>
        </ul>

        <h3>开发工具</h3>
        <p class="muted">开发者辅助功能。</p>
        <ul>
          <li><strong>图库查看</strong>：浏览和管理上传的图片</li>
          <li><strong>OSS 上传</strong>：上传文件到阿里云 OSS 存储</li>
          <li><strong>题库上传</strong>：批量上传试题数据</li>
        </ul>

        <h3>领创</h3>
        <p class="muted">管理领创平台设备应用和计算管理员密码。</p>
        <ul>
          <li>输入 <strong>设备号、用户名、设备型号</strong> 后点击"登录并获取应用"</li>
          <li>用户名自动从中育登录信息填充</li>
          <li>在"应用管理"中查看应用列表，点击详情可查看图标、下载地址</li>
          <li>在"密码计算器"中输入设备号即可获取管理员密码（每天动态变化）</li>
          <li>移动端下载时会弹窗显示下载链接供复制使用</li>
        </ul>

        <h3>新测评</h3>
        <p class="muted">查看测评任务和数据。</p>
        <ul>
          <li>浏览测评列表和详情</li>
          <li>自动读取当前页已完成作业的题目分析，按登录学生 ID 识别本人错题，在列表显示加入中育官方错题本按钮；翻页继续识别。</li>
          <li>本地记录按学校服务器和账号隔离；失败显示待同步，再次核对会先检查官方状态以避免重复。</li>
        </ul>
      </section>
    </el-card>

    <el-card class="block" header="致谢">
      <p>感谢各位的使用，我们有缘再会。</p>
      <p>开发：Loshop</p>
      <p>贡献者：Aoki</p>

      <p>界面字体：<a href="https://github.com/atelier-anchor/smiley-sans" target="_blank" rel="noopener noreferrer">得意黑 Smiley Sans · atelierAnchor</a>，按 SIL Open Font License 1.1 分发。</p>
      <p>PDF 正文字体：<a href="https://github.com/adobe-fonts/source-han-serif" target="_blank" rel="noopener noreferrer">思源宋体 · Adobe / Google</a>，按 SIL Open Font License 1.1 分发。</p>
      <p>PDF 数学排版：<a href="https://katex.org/" target="_blank" rel="noopener noreferrer">KaTeX</a>，按 MIT License 分发。数学字体随包提供，导出时在本地渲染。</p>
      <p>设计参考：<a href="https://github.com/emilkowalski/skills" target="_blank" rel="noopener noreferrer">Emil Kowalski 的 Design Engineering</a> 与 <a href="https://wise.design/" target="_blank" rel="noopener noreferrer">Wise Design</a>。界面为本版本独立实现。</p>
      <p><a :href="EDITION.sourceUrl" target="_blank" rel="noopener noreferrer">查看原始项目</a></p>
    </el-card>

    <el-card class="block" header="更新日志">
      <el-timeline v-if="changelog.length">
        <el-timeline-item
          v-for="(log, i) in changelog"
          :key="i"
          :timestamp="log.date"
          placement="top"
        >
          <div v-for="(item, j) in log.items" :key="j" class="log-item">{{ item }}</div>
        </el-timeline-item>
      </el-timeline>
      <p v-else class="muted">加载中…</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { EDITION } from '@/config/edition'
interface UpdateEntry {
  date: string
  items: string[]
}

const changelog = ref<UpdateEntry[]>([])

async function loadChangelog() {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}update.json?t=${Date.now()}`)
    if (!resp.ok) return
    const data = (await resp.json()) as UpdateEntry[]
    // 最新在前
    changelog.value = data.slice().reverse()
  } catch {
    // 忽略加载失败
  }
}

onMounted(loadChangelog)
</script>

<style scoped>
.about-page {
  max-width: 880px;
  margin: 0 auto;
}
.block {
  margin-bottom: 16px;
}
.title {
  margin: 0 0 12px;
}
.usage h3 {
  margin: 18px 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.usage h3:first-child {
  margin-top: 0;
}
.usage p {
  margin: 0 0 8px;
  line-height: 1.7;
}
.usage ul {
  margin: 0 0 6px;
  padding-left: 20px;
  line-height: 1.9;
}
.muted {
  color: var(--el-text-color-secondary);
}
.log-item {
  line-height: 1.8;
}
@media (max-width: 767px) {
  .about-page {
    padding: 0 4px;
  }
}
</style>

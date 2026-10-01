# ZhongYuToolBox · Windows aoki edition

基于 [Loshop-Studio/ZhongYuToolBox_Web](https://github.com/Loshop-Studio/ZhongYuToolBox_Web) 的独立 Windows 改造版。原作者 **Loshop**；新增 co-author **aoki**。感谢原作者及所有贡献者，保留原有“支持作者”入口与捐赠对象。本 fork 不代表中育官方或原作者发布。

[下载 Windows 便携包](https://github.com/nickfox395/ZhongYuToolBox_Web/releases) · [操作与构建说明](WINDOWS_AOKI.txt) · [后端依赖说明](SERVER_DEPENDENCIES.md) · [新增接口合约](api.md)

## Windows 版本

- WPF 原生窗口 + 系统 WebView2，发布包不包含 Electron / Node。
- 得意黑字体，灰紫／暖白配色，浅色／深色／跟随系统模式；收起侧栏图标居中。
- PNG、JPG、WebP 在本地合成 PDF，可重排图片和逐张逆时针旋转；竖版 PDF 自动逆时针 90°，整页保留，不裁切原文件。
- 云笔记重命名、移至官方回收站和批量移动文件夹；移动保留最新名称与版本，逐条反馈结果。
- 一次多选 PDF，每个文件独立命名并按队列上传；失败可单独重试，成功文件不重复提交；新一轮选择自动更新默认名称。
- 新的紫色笔记图标，SVG 源文件及生成 Windows 多尺寸图标的脚本随源码提供。
- 新测评默认打开已完成作业；查看题目分析时按当前学生 ID 识别错题，返回新测评后批量加入中育官方错题本，检查官方状态去重，失败可重试。没有独立的本地错题本界面。
- 官方错题本按科目导出 A4 PDF，可附答案与解析，长题自动分页。
- 选课嵌入预加载官方加密学生资料，修复初始化竞争；提供重新加载、超时和网络失败提示。
- 登录、文件及测评接口直连官方服务，移除作者的统计／版本／风控服务依赖，分享改为本地加密文件。

本地转换与回归测试不等于真实账号同步验证。官方云笔记操作、错题写入及最终平板导入仍需真实账号／设备确认，本版以预发布提供。中育官方学校服务器和 OSS 仍是云功能的必需依赖，无法保证官方停服后云数据可访问。

## 运行与构建

Windows 10/11 x64，.NET Framework 4.8，Microsoft Edge WebView2 Runtime。解压后在完整目录运行“中育工具箱-aoki.exe”，不要只复制 exe。程序未签名。

```powershell
npm ci
npm run test:pdf
npm run build:windows
```

构建需要 Windows 内置 C# 编译器，不需要 .NET SDK。缺少 WebView2 SDK 缓存时由脚本从官方 NuGet 下载固定版本。完整验证流程见 WINDOWS_AOKI.txt。保留上游 Android / 5+ Worker 与模板兼容性修复；本 fork 只发布 Windows 包。

得意黑按 SIL Open Font License 1.1 分发，授权见 public/fonts/OFL.txt。设计参考 Emil Kowalski 的 Design Engineering 和 Wise Design，UI 独立实现。

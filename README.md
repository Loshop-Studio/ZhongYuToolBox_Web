# ZhongYuToolBox · Windows aoki edition

作者 **Loshop**；

## 应用下载与错题 PDF

- “中育应用下载”直接查询当前学校的官方学生端更新服务，可获取优课畅学等应用，或输入完整 Android 包名查询；下载后本地检查 APK 结构、大小并显示 SHA-256。
- 错题 PDF 的 LaTeX 在本地用 KaTeX 渲染，主字号与约 12 磅宋体正文一致，行内公式对齐经过校正；数学字体及许可证随包提供。
- `npm run test:apps` 运行应用更新合约与 APK 下载的离线测试。

## Electron版本运行与构建

```Shell
npm run dev:electron
npm run build:electron
```



# Uniapp版本构建

```Shell
npm run build:uniapp
```

## Webview2版本运行与构建

Windows 10/11 x64，.NET Framework 4.8，Microsoft Edge WebView2 Runtime。解压后在完整目录运行“中育Toolbox.exe”，不要只复制 exe。程序未签名。

账号缓存位于 `%LOCALAPPDATA%\ZhongYuToolbox-aoki-WebView2`，同一 Windows 用户打开不同版本的便携包会复用登录状态。此目录不在发布包内；当前实现会在本地保存 Token 和用于自动重登的账号、密码，用户中心退出登录会移除这些登录凭据。

```powershell
npm ci
npm run test:pdf
npm run test:linspirer
npm run dev:ww2
# 正式构建（与 build:windows 相同）
npm run build:ww2
npm run build:installer
```

构建需要 Windows 内置 C# 编译器，不需要 .NET SDK。缺少 WebView2 SDK 缓存时由脚本从官方 NuGet 下载固定版本。保留上游 Android / 5+ Worker 与模板兼容性修复；本项目只发布 Windows 包。

`dev:ww2` 编译原生窗口后启动仅监听 `127.0.0.1:5174` 的 Vite 服务，窗口加载开发页面，支持 HMR 和 WebView2 开发工具。关闭窗口或按 Ctrl+C 会停止启动器创建的服务。可用 `npm run dev:ww2 -- --port=5175` 换端口；端口被占用时直接报错，不连接其他服务。开发账号缓存单独位于 `%LOCALAPPDATA%\ZhongYuToolbox-aoki-WebView2-dev`，正式版缓存不受影响；开发产物不能打包为安装程序。

1.1.5 修复领创计算器设备号大小写问题：密码计算与联网用户查询统一去除首尾空白并转为小写，空设备号不发请求。回归使用虚构设备与用户资料。

得意黑按 SIL Open Font License 1.1 分发，授权见 public/fonts/OFL.txt。设计参考 Emil Kowalski 的 Design Engineering 和 Wise Design，UI 独立实现。

PDF 正文使用思源宋体 CN Regular（Adobe / Google），按 SIL Open Font License 1.1 原样分发；字体来源及 SHA-256 见 public/fonts/PRINT_FONT.txt，授权见 public/fonts/SourceHanSerif-LICENSE.txt。字体只在导出时载入。

## 随身答导出与关于应用

随身答回复中打开画板，可直接导出静态 SVG（多页纵向合并，图片内联）；录制可选择画质导出 MP4，或保存最终画面 SVG。文件在本地生成，通过平台保存入口导出，不需要再上传 OSS。MP4 要求运行设备支持 WebCodecs H.264 编码；AAC 不可用时提示无音轨。可取消导出，离开页面自动停止，编码器及时释放。

移动画板回复修复负缩放值、绘图区域塌缩与缩放尺寸不同步，保留选择、画笔、文字、图片及发送流程。

「关于应用」集中检查更新、支持作者、使用说明与致谢。检查更新查询 Loshop-Studio 上游 GitHub 最新正式版，显示 Release 功能说明并跳转下载；不会发送学校账号或自动安装。作者用户量统计保持原实现。

验证：`npm run test:update`；`npm run dev` 后打开 `/tests/board-export.html`，点击「开始导出验证」检查多页 SVG、录制编码、音轨与取消。测试仅使用合成资料。

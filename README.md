# ZhongYuToolBox
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
npm run build:plus
```

## Webview2版本运行与构建

Windows 10/11 x64，.NET Framework 4.8，Microsoft Edge WebView2 Runtime。解压后在完整目录运行“中育Toolbox.exe”，不要只复制 exe。程序未签名。

账号缓存位于 `%LOCALAPPDATA%\ZhongYuToolbox-aoki-WebView2`，同一 Windows 用户打开不同版本的便携包会复用登录状态。此目录不在发布包内；当前实现会在本地保存 Token 和用于自动重登的账号、密码，用户中心退出登录会移除这些登录凭据。

```powershell
npm run dev:ww2
# 正式构建（与 build:windows 相同）
npm run build:ww2
```

构建需要 Windows 内置 C# 编译器，不需要 .NET SDK。缺少 WebView2 SDK 缓存时由脚本从官方 NuGet 下载固定版本。保留上游 Android / 5+ Worker 与模板兼容性修复；本项目只发布 Windows 包。

`dev:ww2` 编译原生窗口后启动仅监听 `127.0.0.1:5174` 的 Vite 服务，窗口加载开发页面，支持 HMR 和 WebView2 开发工具。关闭窗口或按 Ctrl+C 会停止启动器创建的服务。可用 `npm run dev:ww2 -- --port=5175` 换端口；端口被占用时直接报错，不连接其他服务。开发账号缓存单独位于 `%LOCALAPPDATA%\ZhongYuToolbox-aoki-WebView2-dev`，正式版缓存不受影响；开发产物不能打包为安装程序。

得意黑按 SIL Open Font License 1.1 分发，授权见 public/fonts/OFL.txt。设计参考 Emil Kowalski 的 Design Engineering 和 Wise Design，UI 独立实现。

PDF 正文使用思源宋体 CN Regular（Adobe / Google），按 SIL Open Font License 1.1 原样分发；字体来源及 SHA-256 见 public/fonts/PRINT_FONT.txt，授权见 public/fonts/SourceHanSerif-LICENSE.txt。字体只在导出时载入。

## 随身答导出与关于应用

随身答回复中打开画板，可直接导出静态 SVG（多页纵向合并，图片内联）；录制可选择画质导出 MP4，或保存最终画面 SVG。文件在本地生成，通过平台保存入口导出，不需要再上传 OSS。MP4 要求运行设备支持 WebCodecs H.264 编码；AAC 不可用时提示无音轨。可取消导出，离开页面自动停止，编码器及时释放。

移动画板回复修复负缩放值、绘图区域塌缩与缩放尺寸不同步，保留选择、画笔、文字、图片及发送流程。

「关于应用」集中检查更新、支持作者、使用说明与致谢。检查更新查询 Loshop-Studio 上游 GitHub 最新正式版，显示 Release 功能说明并跳转下载；不会发送学校账号或自动安装。作者用户量统计保持原实现。

验证：`npm run test:update`；`npm run dev` 后打开 `/tests/board-export.html`，点击「开始导出验证」检查多页 SVG、录制编码、音轨与取消。测试仅使用合成资料。

画板沿用上游 npm 依赖 `ezy-board-viewer@0.1.4`，不恢复已删除的本地组件目录。`npm ci` 自动应用导出取消、编码器释放、不同尺寸页面居中及旧 WebView ZIP 兼容补丁，说明见 [patches/README.md](patches/README.md)；升级该依赖时需核对并移除或更新补丁。保留上游新增的云笔记预览、PDF 导出与中文字体功能。

## Android / iPhone / iPad 原生构建

> 安卓与IOS平台原生编译功能尚不完善。

新增平台标签 `android`、`ios`，采用资源、测评、问答、我的四组移动导航；原有浏览器、Electron、WebView2、H5+ 布局及作者最新业务页面保留。原登录统计与支持作者入口继续使用。

```sh
npm ci
npm run build:android
npm run build:ios
```

Android 需要 JDK 17、SDK 35 / build-tools 35.0.0、Gradle 8.14.3；产物在 `release/android`。[Android 构建与签名说明](native-android/README.md)。iOS 需要 macOS / Xcode 26+，可使用 GitHub Actions 的 Build iOS IPA 获取未签名 IPA 和模拟器截图；Windows 仅能 `npm run build:ios -- --web-only`，产物在 `release/ios`。[iOS 构建与安装说明](native-ios/README.md)。构建不会自动发布 Release。

开发预览：`npm run dev:android`、`npm run dev:ios`；桥接测试：`npm run test:android`、`npm run test:ios`。预览中的网页底栏仅是回退，iOS 设备使用苹果原生底栏及返回按钮。新壳使用独立包名，不自动继承旧 H5+ 版本或 fork 的登录资料。

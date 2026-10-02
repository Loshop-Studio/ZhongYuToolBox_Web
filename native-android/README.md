# 中育工具箱 · aoki Android

沿用 aoki 版 Vue 界面及功能，使用 Android 原生 WebView 壳。原作者 Loshop 的署名、致谢和“支持作者”入口保留。上游 0.0.6 APK 的 H5+ 打包方式仅作为移动适配参考，本目录是独立实现。

- 包名：`com.aoki.zhongyutoolbox`，可与原作者客户端共存。
- Android 8.0+，需要支持 WebMessageListener 的 Android System WebView / Chrome。
- 界面和字体打包在 APK 内；登录及业务数据仍来自学校官方服务。
- 系统文件选择器支持多选 PDF/图片；导出通过系统“另存为”，不申请全盘存储权限。
- 每张图片可逆时针旋转，竖版 PDF 在本机处理；原文件不覆盖。
- 浅色/深色/跟随系统；手机抽屉和横屏平板侧栏使用同一 aoki 主题。
- 选课和官方页面在独立 WebView 中打开，只允许网络桥；不能调用本机文件保存或设备接口。
- 仅声明 INTERNET 权限，不含设备管理、无障碍、后台常驻权限。
- 不打包 AppData、账号、Token、浏览器资料或用户笔记；禁止系统备份应用数据。

## 构建

需要 Node/npm、JDK 17、Gradle 8.14.3、Android SDK platform 35 / build-tools 35.0.0。
设置 `JAVA_HOME`、`ANDROID_SDK_ROOT`；`ZYTB_GRADLE` 可指定 Gradle 可执行文件，否则使用本机 Gradle wrapper 缓存中的 8.14.3。

```sh
npm install
npm run test:android
npm run build:android
```

产物：`release/android/ZhongYuToolBox-aoki-1.1.7-Android.apk` 及 SHA256SUMS.txt。界面显示、Android versionName、versionCode 和安装包文件名都从根目录 package.json 读取版本号；后续发版只需更新该文件及 lockfile。
脚本调用 zipalign 和 apksigner 验证签名。首次构建自动在 `~/.codex/signing/zhongyu-toolbox-aoki-android/` 创建本机签名密钥；保留该目录，后续 APK 才能覆盖升级。密钥与密码不进入仓库或 APK。

开发时可用 Android Studio 打开本目录；先运行 build:android 生成前端资源。Debug 允许 WebView 调试，Release 关闭。

## 已验证

Android 15 隔离模拟器中验证了安装/启动、手机抽屉、横屏平板布局、得意黑字体、深浅色和系统主题变化、官方学校发现请求、多选 PDF、图片转换 worker、PDF 渲染 worker及系统“另存为”。测试图片生成两页 PDF，自动逆时针 90°和手动逆时针 180°后页面尺寸符合预期，保存后的文件可以再次读取。

`test:android` 覆盖分块二进制请求/保存、响应头、空响应、错误传播、XHR，以及远程页面权限隔离和 Android OSS 签名。`test:pdf`、`test:apps`、`test:linspirer` 回归通过。网络上传测试使用假凭证与模拟响应，没有提交真实笔记；真实账号的登录、上传及学校业务权限需要在使用设备上验证。

## 限制

单次原生请求/保存上限 128 MB，响应上限 256 MB；大 PDF 建议分批处理。学校接口权限、可用性与官方客户端相同。没有绕过受管平板的安装策略。应用安装标识不是中育的 swdid。

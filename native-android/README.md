# Android 原生壳

Android WebView 加载包内 Vite 编译资源。`android` 标签启用资源、测评、问答、我的四组导航；现有 `plus` 构建继续使用作者的布局及 `plus.*` 调用。业务页面复用最新上游源码，支持作者、说明致谢及登录统计保留。

## 构建

需要 Node/npm、JDK 17、Gradle 8.14.3、Android SDK platform 35 / build-tools 35.0.0。设置 `JAVA_HOME`、`ANDROID_SDK_ROOT` 和 `ZYTB_GRADLE`（Gradle 可执行文件路径）；未指定 Gradle 时检查本机对应版本的 wrapper 缓存。

```sh
npm ci
npm run test:android
npm run build:android
```

产物：`release/android/ZhongYuToolBox-<版本>-Android.apk` 和 SHA256SUMS.txt。版本来自 package.json；新原生壳包名为 `com.loshop.zhongyutoolbox.native`，可与旧 H5+ 版本及 aoki fork 共存，不会直接迁移旧客户端的登录缓存。

首次构建在 `~/.codex/signing/zhongyu-toolbox-upstream-android/` 生成本机构建签名密钥，升级需保留此目录。密钥、密码、用户缓存不会复制进 APK 或仓库。该签名是开发者本机签名，不代表作者现有 Release 的签名身份。

## 原生能力与边界

系统文件选择、多选及 SAF 另存为；二进制网络与 OSS 签名桥；浅色、深色、跟随系统；选课使用独立远程 WebView，限制在正文区域，保留应用返回按钮。远程页面没有本机文件、设备或窗口权限。只声明 INTERNET，不申请全盘存储、设备管理或后台权限；不复制任何真实账号数据。原生安装标识不是中育 swdid。

Android 8.0+；需支持 WebMessageListener 的系统 WebView。单次请求/保存上限 128 MB、响应上限 256 MB。`test:android` 使用模拟凭据验证二进制完整性、空响应、错误传播、XHR、权限边界及 OSS 签名；不能替代真实设备上学校业务权限和实际账号操作的测试。

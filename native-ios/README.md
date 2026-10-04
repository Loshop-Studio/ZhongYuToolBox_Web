# iPhone / iPad 原生壳

Swift + WKWebView 加载包内 Vite 资源，iPhone/iPad 共用业务页面。`ios` 标签启用资源、测评、问答、我的四组导航；其他平台继续使用作者原有布局、主题及 H5+ 调用。原作者 Loshop；移动壳贡献者 aoki。支持作者、致谢与原登录统计保留。

底栏使用 Apple UITabBarController / UITab / UISearchTab，支持滑动切换；详情返回使用 UIKit 按钮。iOS 26 使用系统 Liquid Glass，较早系统使用标准原生外观。设备 IPA 不绘制网页玻璃底栏；系统决定安全区域，页面按实际底栏高度留出内容空间。支持浅色、深色、跟随系统和 iPad 横竖屏/分屏。

## 构建

```sh
npm ci
npm run test:ios
npm run build:ios
```

完整 IPA 需要 **macOS / Xcode 26+**。Windows 可以运行 `npm run build:ios -- --web-only` 准备网页和 Xcode 工程，不能产出 IPA；`npm run dev:ios` 提供网页预览，预览不代表原生组件验证。`test:ios` 在 Windows 明确跳过 Swift 编译，在 macOS 实际编译策略与回环资产服务器测试。

GitHub Actions 的 **Build iOS IPA** 使用 macos-26，生成 `release/ios/ZhongYuToolBox-<版本>-iOS-unsigned.ipa`、SHA256SUMS 和 iPhone/iPad 模拟器测试截图，保存在运行页 Artifacts；不自动发 Release，不需要 Apple ID 或签名证书。版本来自 package.json，包名为 `com.loshop.zhongyutoolbox.ios`，与 aoki fork 分开。

## 网络、文件与安装

主页面仅从回环 `127.0.0.1:18765` 启动。官方 API/OSS 使用 URLSession；图片由受限 WKURLSchemeHandler 读取，不发送 Referer/Origin、Cookie 或账号鉴权头。TLS 保留系统验证；仅官方遗留 HTTP 域名配置 ATS 例外。选课远程页面使用独立 WKWebView，只有受限网络桥。临时二进制请求/保存上限 128 MB、响应上限 256 MB、图片上限 32 MB。

导出使用系统文件保存面板；官方应用下载中的 APK 供 Android 使用，不能在 iOS 安装。账号沿用上游自动重登，在设备 WKWebsiteDataStore 中保存，不进入构建包。模拟测试数据只编译进模拟器，不进入设备 IPA。

未签名 IPA 需要在爱思助手 IPA 签名功能中使用自己的 Apple ID 或证书重新签名再安装，按设备提示信任开发者、开启开发者模式。签名身份/包名更换或重装可能需要重新登录。构建流程不收集 Apple ID、证书、密码或用户缓存。

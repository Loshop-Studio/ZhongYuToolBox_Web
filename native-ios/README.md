# iPhone / iPad · aoki iOS edition

Swift + UIKit + WKWebView 原生壳，保留 aoki 的紫白配色、得意黑与既有业务界面。原作者 Loshop；co-author aoki；“支持作者”和致谢入口保留。适配 iPhone / iPad、横竖屏及 iPad 分屏；不捆绑 Electron / Node。

## Liquid Glass

使用 Xcode 26+ SDK 编译。在 iOS/iPadOS 26+，导航栏、工具栏、菜单和文件面板使用 UIKit 自带的 Liquid Glass；内容卡片保持清晰、不叠加网页模拟玻璃。旧系统显示其原生常规样式。尊重系统减少动态效果设置。iPad 保留侧栏；iPhone 用原生底部常用工具栏和“更多”菜单。菜单提供浅色、深色、跟随系统。

## 功能与接口

复用已有登录、云笔记、多 PDF 上传、图片本地转 PDF / 逆时针旋转、图库回收站、新测评错题识别、官方错题本及教辅式 PDF 导出。PDF / ZIP / APK 的导出通过系统文件面板选择保存到“文件”。中育应用下载得到的 **APK 供 Android 平板使用，不能在 iPhone/iPad 安装**。

主界面从包内资源启动，仅监听 `127.0.0.1:18765`，不开放局域网端口。固定 origin 保持账号 / 外观设置跨启动保存。官方 API/OSS 请求用 URLSession 直连，TLS 使用系统校验，不依赖作者网页服务器。HTTP 只按域名对官方遗留接口配置 ATS 例外。临时二进制分块传输，上传/保存上限 128 MB，响应上限 256 MB。远端选课/专栏使用独立、非持久化 WKWebView，只有受限网络桥，不提供文件/设备/窗口权限；非主框架也不能调用桥。作者用户量统计在此 fork 默认关闭。

账号凭据保存在本机 WKWebsiteDataStore，沿用已有自动重登行为，退出登录可清除；不复制进 IPA。iOS 的 identifierForVendor 不是中育平板的 swdid，不可替代领创绑定设备号。

## 构建

```sh
npm ci
npm run test:ios
npm run build:ios
```

完整 IPA 构建需要 macOS / Xcode 26+，不要求 Apple ID、开发团队或签名证书。Windows 可以检查并构建前端：

```powershell
npm run test:ios
npm run build:ios -- --web-only
npm run dev:ios
```

`test:ios` 在 macOS 额外编译真实 Swift 策略和回环资产服务器，检查路径限制、响应流及 origin 边界；在 Windows 明确跳过原生部分。只通过 Windows 测试不代表 IPA 已编译或真机功能验证完成。

GitHub Actions 的 **Build iOS IPA** 使用 `macos-26` 云端构建。完成后从对应运行页的 Artifacts 下载 `ZhongYuToolBox-iPhone-iPad-unsigned-IPA`，解压获得 `ZhongYuToolBox-aoki-<版本>-iOS-unsigned.ipa` 与 SHA256SUMS。工作流不使用、收集或发布 Apple ID、证书、密码、用户缓存。生成工程及 WebAssets 为构建产物，不进入源码提交。

## 爱思助手签名安装

1. 将 iPhone/iPad 连接到电脑，打开爱思助手的 **工具箱 → IPA 签名**。
2. 添加上面生成的 `iOS-unsigned.ipa`。
3. 使用你自己的 Apple ID 或适用的证书/描述文件签名。凭据只在爱思中输入，不需要提交到 GitHub 或聊天。
4. 签名完成后安装生成的已签名 IPA。按照设备实际提示信任开发者、开启开发者模式。

未签名 IPA 不能直接安装。普通 Apple ID 签名有效期、应用数量与授权设备等限制取决于苹果和爱思的实际签名方式。更新时保持一致的签名身份与包名才能保留本机登录数据；更换包名/重装可能重新登录。

参考：[Apple Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)、[爱思官方签名教程](https://www.i4.cn/news_detail_38195.html)。

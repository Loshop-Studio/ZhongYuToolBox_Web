# Windows 安装包

安装包使用 C# WPF + WebView2 正式生产产物，适用 Windows 10/11 x64。原作者 Loshop，co-author aoki；保留支持作者入口。

运行 `ZhongYuToolBox-aoki-版本-Windows-x64-Setup.exe`，按中文向导选择目录与快捷方式。默认安装到 `%LOCALAPPDATA%\Programs\ZhongYuToolbox-aoki`，仅为当前用户安装，不要求管理员权限。相同应用 ID 支持覆盖升级，Windows“已安装的应用”中提供卸载入口。

需要 .NET Framework 4.8 或更新版本。安装向导检测并提示缺失的 .NET；WebView2 Runtime 缺失时运行随包的微软 Evergreen Bootstrapper，联网安装后重新检测，安装失败时不会报告应用安装成功。已安装 WebView2 的机器无需再次下载运行时。完整离线运行时不包含在包内。

安装、升级及卸载保留 `%LOCALAPPDATA%\ZhongYuToolbox-aoki-WebView2` 中的本机账号缓存。需要清除登录信息时先在应用中退出登录。安装包不读取或包含此目录，卸载不删除用户创建的文件。安装程序与应用均未进行代码签名。

## 构建

```powershell
npm ci
npm run build:windows
npm run build:installer
```

也可以对已完成的正式生产构建直接执行 `npm run build:installer`。脚本使用 `.local/latest-windows-build.json`，拒绝 QA 构建、测试页面、用户缓存和未知顶层文件，仅按显式清单打包。生成 `release/*-Setup.exe`、SHA-256 文件及 `.local/latest-installer-build.json`。

编译器固定为 [Inno Setup 6.7.3](https://jrsoftware.org/isdl.php)，从官方仓库下载，核验固定 SHA-256 和 Pyrsys B.V. 数字签名，再仅为当前用户安装到 `.local/installer-tools/InnoSetup`。中文翻译使用官方仓库固定提交 `6ef32198ef1f7b7b375cd4b6b90896c2a58eb4c2`，保留翻译者署名。微软运行时安装程序从官方链接下载并核验 Microsoft Corporation 数字签名，其实际摘要记录到构建清单。Inno Setup、WebView2、前端依赖与字体的授权随包保留。

有关运行时部署：[微软 WebView2 分发文档](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)。

已有安装包不会被构建脚本覆盖；需要重建时先另存原产物。`pwsh -File scripts/test-installer.ps1` 验证独立目录安装、已装文件与清单逐一匹配、真实生产窗口和登录界面启动、覆盖升级、快捷方式、卸载登记与卸载后的缓存保留。该测试拒绝覆盖已有安装或桌面快捷方式，启动测试使用独立 WebView2 资料目录，不读取当前账号。缺少 WebView2 或 .NET 的真实机器仍需另行验证，不能以开发机测试替代。

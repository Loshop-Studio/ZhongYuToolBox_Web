# 上游 PR 与 aoki fork 的统计差异

原作者要求保留用户量统计。提交到 `Loshop-Studio/ZhongYuToolBox_Web` 的版本必须保留：

- `src/utils/track.ts` 的 `reportLogin`。
- `src/stores/auth.ts` 成功登录后的 `reportLogin(effectiveSchool, account)` 调用，包括自动重新登录。
- 原接口 `POST https://tbapi.loshop.com.cn/api/login`，JSON `{ school, username, deviceId: '' }`。
- 最新上游 `e94e1e8` 已恢复原统计实现及调用，优先保留这些现有代码。如果引入 fork 的统计开关，上游的 `AUTHOR_STATS_DEFAULT` 必须为 `true`；不能把 fork 的关闭默认值合入上游。

`nickfox395/ZhongYuToolBox_Web` 保持 `AUTHOR_STATS_DEFAULT = false`，其发布包不请求作者统计服务。构建时可显式设置 `VITE_AUTHOR_STATS=true/false` 覆盖默认值。

统计失败或作者服务停服不得阻断官方登录，不恢复强制更新、封禁或环境扫描。统计请求不发送密码、Token、文件或设备扫描结果。

上游 PR 提交前同时检查源码调用和实际构建的统计开关；fork 发版前运行 `npm run test:stats`，确保禁用分支不发请求。

## 上游 UI/UX 基线

原作者提供的 `中育Toolbox安卓客户端 v0.0.7 patch1.apk.1` 包含 HBuilder / 5+ 网页资源，SHA-256 为 `5703a7d1d0330d472a338df87e3cee9d35686d8916dfe279d5e758eea19fae6b`。只读提取前端资源，并与上游 `e94e1e8`（`feat:改进了UI/UX`）源码交叉检查；没有安装该 APK，也没有执行真实账号或设备操作。

后续 PR 基于最新上游 main，保留其以下流程，并把新增功能适配到这些页面：

- 新测评列表滚动加载；本人错题识别状态与加入按钮在试题详情，移动端操作收进底部菜单。
- 图库缩略图直接提供删除入口；图片详情保留独立操作。若修正接口参数，保留作者的按钮布局。
- 移动端重命名 / 删除使用操作面板；桌面保留右键菜单。
- 安卓官方应用下载使用 `plus.downloader`，完成后 `plus.runtime.install` 唤起安装；不能用 fork 的浏览器另存为流程覆盖该分支。
- 保留作者最新的主题、菜单精简及领创用户名自动填充。

fork 继续保留 aoki 的界面，以及新测评列表自动识别与加入按钮、WebView2 / Android WebView 壳。本次没有把上游 UX 整体覆盖到 fork。

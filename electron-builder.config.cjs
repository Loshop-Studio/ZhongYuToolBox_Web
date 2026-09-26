/**
 * electron-builder 打包配置（build:electron 使用）
 * - 产出未打包目录（win-unpacked），便于快速验证；
 *   如需生成安装包，可将 win.target 改为 ['nsis']。
 */
module.exports = {
  appId: 'com.zhongyu.toolbox',
  productName: '中育ToolBox',
  copyright: 'Copyright © 2024 ZhongYuToolBox',
  // 复用工程内已安装的 electron 运行包，避免 electron-builder 联网下载
  electronDist: 'node_modules/electron/dist',
  // 使用网页图标（public/icon.png 封装的 .ico）
  icon: 'public/icon.ico',
  directories: {
    output: 'release',
    buildResources: 'electron/resources'
  },
  files: ['dist/**/*', 'electron/**/*', 'package.json'],
  // 将 Everything 命令行 es.exe 打包进 resources/es/，运行时由风控模块调用
  extraResources: [{ from: 'electron/resources/es', to: 'es' }],
  // 运行时只依赖打包进 dist 的浏览器代码，无需 node_modules；
  // 关闭原生模块重建（避免 jspdf 的可选依赖 canvas 在缺编译环境下失败）。
  npmRebuild: false,
  asar: true,
  win: {
    target: ['dir']
  }
}

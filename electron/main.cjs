/**
 * Electron 主进程
 * - 开发模式（ELECTRON_DEV=1）：加载 vite 开发服务器 http://localhost:5173
 * - 生产模式：加载 vite 打包产物 dist/index.html（相对 base，可直接 file:// 打开）
 *
 * 渲染进程通过 preload 暴露的 window.electronAPI 与原生能力通信，
 * 例如文件保存走主进程的 dialog + fs（见 ipcMain 'save-file'）。
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const riskControl = require('./riskControl.cjs')

const isDev = process.env.ELECTRON_DEV === '1'
const DEV_URL = 'http://localhost:5173'

// 移除默认应用菜单栏（窗口不再显示菜单）
Menu.setApplicationMenu(null)

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '中育ToolBox',
    // 窗口图标（标题栏 / 任务栏），使用网页图标
    icon: path.join(__dirname, 'appicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // 必须显式开启，否则 <webview> 标签不渲染（选课/专栏内嵌白屏的根因）
      webviewTag: true
    }
  })

  if (isDev) {
    win.loadURL(DEV_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  // 桌面端以 file://（生产）或 http://localhost:5173（开发）加载，renderer 的 Origin
  // 为 null / localhost，而 OSS bucket、PDF 转图接口等的 CORS 白名单不含这些值，
  // 导致 aliyun-oss 直传 PUT（带 x-oss-* 自定义头触发预检）以及跨域拉取 OSS 图片被浏览器拦截。
  // 在响应层为已知外部资源域名注入 ACAO:*，仅放行这些域名，仍保持 webSecurity 开启。
  // 如需放行更多域名，把对应主机名加进下面的正则即可。
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const { url, responseHeaders } = details
    if (/aliyuncs\.com|zyai\.cc/.test(url)) {
      const headers = { ...responseHeaders }
      headers['Access-Control-Allow-Origin'] = ['*']
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, HEAD, OPTIONS']
      headers['Access-Control-Allow-Headers'] = ['*']
      headers['Access-Control-Expose-Headers'] = ['*']
      return callback({ responseHeaders: headers, statusLine: details.statusLine })
    }
    callback({})
  })

  createWindow()

  // 启动本地风控扫描（非阻塞，结果缓存后供渲染进程在登录时读取）
  riskControl.runRiskScan().catch((e) => console.error('[riskControl] 扫描异常:', e))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 设备号：在 userData 下持久化一个稳定 UUID（重装前不变）
function getDeviceId() {
  const p = path.join(app.getPath('userData'), 'deviceid.json')
  try {
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (d && d.id) return d.id
    }
  } catch {}
  const id = crypto.randomUUID()
  try {
    fs.writeFileSync(p, JSON.stringify({ id }))
  } catch {}
  return id
}

ipcMain.handle('get-device-id', () => getDeviceId())
ipcMain.handle('get-risk-scores', async () => riskControl.getRiskScores())

/**
 * 文件保存：弹出原生保存对话框并写入磁盘。
 * 渲染进程传来的 arrayBuffer 经由 contextBridge 已被还原为可写的 Buffer 源。
 */
ipcMain.handle('save-file', async (event, arrayBuffer, filename) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: filename || 'download',
    properties: ['createDirectory', 'showOverwriteConfirmation']
  })
  if (canceled || !filePath) return { canceled: true, filePath: null }
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer))
  return { canceled: false, filePath }
})

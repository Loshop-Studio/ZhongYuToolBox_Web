/**
 * Electron 主进程
 * - 开发模式（ELECTRON_DEV=1）：加载 vite 开发服务器 http://localhost:5173
 * - 生产模式：加载 vite 打包产物 dist/index.html（相对 base，可直接 file:// 打开）
 *
 * 渲染进程通过 preload 暴露的 window.electronAPI 与原生能力通信，
 * 例如文件保存走主进程的 dialog + fs（见 ipcMain 'save-file'）。
 */
const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

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
      webSecurity: true
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

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

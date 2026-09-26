/**
 * 开发模式启动器（dev:electron）
 * 1. 启动 vite 开发服务器（--mode electron）
 * 2. 轮询等待 http://localhost:5173 就绪
 * 3. 启动 Electron 主进程（ELECTRON_DEV=1），由 main.cjs 加载 dev server
 * 关闭 Electron 窗口后自动退出并关闭 vite。
 */
import { spawn } from 'node:child_process'

const PORT = 5173
const DEV_URL = `http://localhost:${PORT}`

const vite = spawn('npx', ['vite', '--mode', 'electron'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
})

function waitForServer(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = setInterval(async () => {
      try {
        const res = await fetch(DEV_URL)
        if (res.ok) {
          clearInterval(timer)
          resolve()
        }
      } catch {
        if (Date.now() - startedAt > timeoutMs) {
          clearInterval(timer)
          reject(new Error('Vite 开发服务器启动超时'))
        }
      }
    }, 500)
  })
}

async function main() {
  await waitForServer()
  const electron = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ELECTRON_DEV: '1' }
  })
  electron.on('exit', (code) => {
    vite.kill()
    process.exit(code ?? 0)
  })
}

main().catch((e) => {
  console.error(e)
  vite.kill()
  process.exit(1)
})

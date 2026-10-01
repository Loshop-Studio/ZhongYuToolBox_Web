import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
process.chdir(root)
if (process.platform !== 'win32') throw new Error('dev:ww2 requires Windows')
const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice(7) || 5174)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid development port')
const qa = process.argv.includes('--test')
const url = `http://127.0.0.1:${port}/`
execFileSync(process.execPath, ['scripts/build-windows.mjs', '--dev'], { stdio: 'inherit', windowsHide: true })
const build = JSON.parse(fs.readFileSync('.local/latest-dev-windows-build.json', 'utf8'))
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'webview2', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: 'inherit', windowsHide: true
})
let app, stopping = false, viteExited = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of [app, vite]) {
    if (!child?.pid || child.exitCode !== null) continue
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) } catch {}
  }
  process.exit(code)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stop())
vite.on('error', error => { console.error(error); stop(1) })
vite.on('exit', code => { viteExited = true; if (!stopping) stop(code || 1) })
try {
  const deadline = Date.now() + 60000
  let ready = false
  while (!viteExited && Date.now() < deadline) {
    try {
      const response = await fetch(url + '@vite/client', { signal: AbortSignal.timeout(1500) })
      ready = response.ok && (await response.text()).includes('WebSocket')
    } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!ready || viteExited) throw new Error('Vite development server failed to start')
  console.log(`WebView2 development window: ${url}; close the window or press Ctrl+C to stop.`)
  app = spawn(build.exe, ['--dev-url', url, ...(qa ? ['--qa'] : [])], { stdio: 'inherit', windowsHide: qa })
  app.on('error', error => { console.error(error); stop(1) })
  app.on('exit', code => {
    if (qa) {
      try {
        const report = JSON.parse(fs.readFileSync(path.join(build.output, 'qa-result.json'), 'utf8').replace(/^\uFEFF/, ''))
        if (!report.passed) throw new Error(JSON.stringify(report))
        console.log(`WebView2 dev regression passed: ${report.checks.length} checks.`)
      } catch (error) { console.error(error); stop(1); return }
    }
    stop(code || 0)
  })
} catch (error) { console.error(error); stop(1) }

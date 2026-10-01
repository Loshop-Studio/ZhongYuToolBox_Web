import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
process.chdir(root)
const qa = process.argv.includes('--qa')
const sdk = path.join(root, '.local/webview2')
if (!fs.existsSync(path.join(sdk, 'lib/net462/Microsoft.Web.WebView2.Wpf.dll'))) {
  fs.mkdirSync(path.join(root, '.local'), { recursive: true })
  const archive = path.join(root, '.local/webview2.zip')
  const response = await fetch('https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4258.31/microsoft.web.webview2.1.0.4258.31.nupkg')
  if (!response.ok) throw new Error('WebView2 SDK download failed: ' + response.status)
  fs.writeFileSync(archive, new Uint8Array(await response.arrayBuffer()))
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(sdk)} -Force`], { stdio: 'inherit', windowsHide: true })
}
if (!process.argv.includes('--skip-frontend')) {
  execFileSync(process.execPath, ['node_modules/vue-tsc/bin/vue-tsc.js', '-b'], { stdio: 'inherit' })
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.config.ts', '--mode', 'webview2'], {
    stdio: 'inherit', env: { ...process.env, ZYTB_BUILD_QA: qa ? '1' : '' }
  })
}
// Fresh output per build; no deleting or overwriting a running client's files.
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const output = path.join(root, 'release', `${qa ? 'webview2-qa' : 'windows-webview2'}-${stamp}`)
fs.mkdirSync(output, { recursive: true })
const framework = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319')
const exe = path.join(output, '中育工具箱-aoki.exe')
const refs = ['System.dll', 'System.Core.dll', 'System.Web.Extensions.dll', 'System.Net.Http.dll', 'System.Xaml.dll',
  'WPF/WindowsBase.dll', 'WPF/PresentationCore.dll', 'WPF/PresentationFramework.dll'].map(f => '/reference:' + path.join(framework, f))
refs.push(...['Core', 'Wpf'].map(f => '/reference:' + path.join(sdk, `lib/net462/Microsoft.Web.WebView2.${f}.dll`)))
execFileSync(path.join(framework, 'csc.exe'), ['/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
  '/out:' + exe, '/win32manifest:' + path.join(root, 'native-windows/app.manifest'), '/win32icon:' + path.join(root, 'public/icon.ico'), ...refs,
  path.join(root, 'native-windows/Program.cs')], { stdio: 'inherit' })
for (const name of ['Core', 'Wpf']) fs.copyFileSync(path.join(sdk, `lib/net462/Microsoft.Web.WebView2.${name}.dll`), path.join(output, `Microsoft.Web.WebView2.${name}.dll`))
fs.copyFileSync(path.join(sdk, 'runtimes/win-x64/native/WebView2Loader.dll'), path.join(output, 'WebView2Loader.dll'))
fs.copyFileSync('native-windows/bridge.js', path.join(output, 'bridge.js'))
fs.copyFileSync('native-windows/App.exe.config', exe + '.config')
function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const target = path.join(destination, entry.name)
    const original = path.join(source, entry.name)
    if (entry.isDirectory()) copyDirectory(original, target)
    else fs.copyFileSync(original, target)
  }
}
copyDirectory('dist', path.join(output, 'dist'))
if (qa && !fs.existsSync(path.join(output, 'dist/tests/native-qa.html'))) throw new Error('QA entry missing from build')
if (!qa && fs.existsSync(path.join(output, 'dist/tests'))) throw new Error('QA pages leaked into production build')
fs.mkdirSync(path.join(output, 'LICENSES'))
fs.copyFileSync(path.join(sdk, 'LICENSE.txt'), path.join(output, 'LICENSES/WebView2-LICENSE.txt'))
fs.copyFileSync(path.join(sdk, 'NOTICE.txt'), path.join(output, 'LICENSES/WebView2-NOTICE.txt'))
for (const name of ['vue', 'pinia', 'element-plus', 'pdf-lib', 'pdfjs-dist', 'html2canvas', 'crypto-js', 'jszip', 'ali-oss']) {
  const directory = path.join(root, 'node_modules', name)
  for (const file of fs.readdirSync(directory).filter(name => /^(license|notice)(\.|$)/i.test(name))) {
    if (fs.statSync(path.join(directory, file)).isFile()) fs.copyFileSync(path.join(directory, file), path.join(output, 'LICENSES', name + '-' + file))
  }
}
fs.copyFileSync('WINDOWS_AOKI.txt', path.join(output, 'WINDOWS_AOKI.txt'))
execFileSync(exe, ['--self-test'], { windowsHide: true })
fs.writeFileSync('.local/latest-windows-build.json', JSON.stringify({ exe, output, qa }, null, 2))
console.log(`Windows WebView2 build: ${exe}`)

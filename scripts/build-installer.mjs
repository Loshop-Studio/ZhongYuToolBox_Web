import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
process.chdir(root)
if (process.platform !== 'win32') throw new Error('Windows is required to build this installer')
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Invalid version')
const latest = JSON.parse(fs.readFileSync('.local/latest-windows-build.json', 'utf8'))
if (latest.qa) throw new Error('Refusing to package a QA build')
const source = fs.realpathSync(latest.output)
if (!source.startsWith(path.join(root, 'release', 'windows-webview2-'))) throw new Error('Unexpected production directory')
const tools = path.join(root, '.local', 'installer-tools')
fs.mkdirSync(tools, { recursive: true })
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()
const psQuote = value => "'" + value.replaceAll("'", "''") + "'"
// Windows PowerShell 5.1 must initialize its own modules when launched from PowerShell 7.
const psEnvironment = { ...process.env }
for (const key of Object.keys(psEnvironment)) if (key.toLowerCase() === 'psmodulepath') delete psEnvironment[key]
const powershell = command => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference = \'Stop\'; ' + command], { encoding: 'utf8', windowsHide: true, env: psEnvironment })
async function download(url, target, digest) {
  if (!fs.existsSync(target)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`)
    fs.writeFileSync(target, new Uint8Array(await response.arrayBuffer()))
  }
  if (digest && hash(fs.readFileSync(target)) !== digest) throw new Error('Download checksum mismatch: ' + target)
}
function verifySignature(file, publisher) {
  powershell(`$s = Get-AuthenticodeSignature -LiteralPath ${psQuote(file)}; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notlike ${psQuote('*' + publisher + '*')}) { throw 'Invalid executable signature' }`)
}
const compilerInstaller = path.join(tools, 'innosetup-6.7.3.exe')
await download('https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe', compilerInstaller,
  '9C73C3BAE7ED48D44112A0F48E66742C00090BDB5BEF71D9D3C056C66E97B732')
verifySignature(compilerInstaller, 'Pyrsys B.V.')
const compilerDir = path.join(tools, 'InnoSetup')
const compiler = path.join(compilerDir, 'ISCC.exe')
if (!fs.existsSync(compiler)) {
  execFileSync(compilerInstaller, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/SP-',
    '/DIR=' + compilerDir, '/NOICONS'], { windowsHide: true })
}
const chinese = path.join(tools, 'ChineseSimplified.isl')
await download('https://raw.githubusercontent.com/jrsoftware/issrc/6ef32198ef1f7b7b375cd4b6b90896c2a58eb4c2/Files/Languages/ChineseSimplified.isl', chinese,
  'E0B0B350E2245F3C5E65586DFE43D574F6E7F06F2261149ABA284954B3FC9A8D')
const bootstrapper = path.join(tools, 'MicrosoftEdgeWebview2Setup.exe')
await download('https://go.microsoft.com/fwlink/p/?LinkId=2124703', bootstrapper)
verifySignature(bootstrapper, 'Microsoft Corporation')

const work = fs.mkdtempSync(path.join(root, '.local', 'installer-build-'))
const payload = path.join(work, 'payload')
const entries = []
function collect(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const rel = prefix + entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Unexpected symlink: ' + rel)
    if (/^(self-test\.json)$/.test(rel)) continue // generated native self-test report, never user data
    if (/(^|\/)(?:\.local|node_modules|tests|User Data|EBWebView|Cache)(\/|$)/i.test(rel) ||
      /qa-result|qa-trace|\.log$/i.test(rel)) throw new Error('Unexpected package data: ' + rel)
    if (entry.isDirectory()) collect(filename, rel + '/')
    else {
      if (!/^(dist\/|LICENSES\/|bridge\.js$|WINDOWS_AOKI\.txt$|Microsoft\.Web\.WebView2\.(Core|Wpf)\.dll$|WebView2Loader\.dll$|中育工具箱-aoki\.exe(?:\.config)?$)/.test(rel))
        throw new Error('Unexpected payload file: ' + rel)
      const bytes = fs.readFileSync(filename)
      if (/\.js$/.test(rel) && /TEST_ONLY_NOT_A_TOKEN|QA_RECYCLE|演示账号 · 测试数据/.test(bytes.toString())) throw new Error('QA fixture leaked: ' + rel)
      const target = path.join(payload, rel)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, bytes)
      entries.push({ path: rel, sha256: hash(bytes), bytes: bytes.length })
    }
  }
}
collect(source)
for (const required of ['dist/index.html', 'bridge.js', '中育工具箱-aoki.exe', 'dist/fonts/SourceHanSerifCN-Regular.otf'])
  if (!entries.some(e => e.path === required)) throw new Error('Missing payload: ' + required)
const notes = path.join(work, '安装说明.txt')
fs.writeFileSync(notes, '\uFEFF中育工具箱 · aoki ' + version + '\r\n\r\n原作者 Loshop；co-author aoki。\r\n本安装包为独立 Windows fork，保留原作者署名及支持入口。\r\n\r\n适用 Windows 10/11 x64。默认仅为当前用户安装，可修改安装位置。\r\n需要 .NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。\r\n缺少 WebView2 时会运行随包微软安装程序并联网下载运行时。\r\n\r\n安装包不包含账号、密码或登录缓存。\r\n账号缓存位于本机 %LOCALAPPDATA%\\ZhongYuToolbox-aoki-WebView2。\r\n安装、升级及卸载会保留这个目录；需要清除登录信息时请先在应用中退出登录。\r\n卸载只移除安装程序登记的文件与快捷方式。\r\n第三方组件和字体授权随应用分发。\r\n本程序及安装包未进行代码签名。\r\n')
for (const [file, rel] of [[notes, '安装说明.txt'], [path.join(compilerDir, 'License.txt'), 'LICENSES/InnoSetup-LICENSE.txt']]) {
  const bytes = fs.readFileSync(file)
  fs.copyFileSync(file, path.join(payload, rel))
  entries.push({ path: rel, sha256: hash(bytes), bytes: bytes.length })
}
entries.sort((a, b) => a.path.localeCompare(b.path))
const manifest = path.join(work, 'payload.iss')
const issQuote = value => value.replaceAll('"', '""')
fs.writeFileSync(manifest, '\uFEFF' + entries.map(e => {
  const subdir = path.dirname(e.path).replaceAll('/', '\\')
  return `Source: "${issQuote(path.join(payload, e.path))}"; DestDir: "{app}${subdir === '.' ? '' : '\\' + subdir}"; Flags: ignoreversion`
}).join('\r\n'))
const outputDir = path.join(root, 'release')
const installer = path.join(outputDir, `ZhongYuToolBox-aoki-${version.split('-')[0]}-Windows-x64-Setup.exe`)
if (fs.existsSync(installer)) throw new Error('Installer already exists; preserve it before rebuilding: ' + installer)
execFileSync(compiler, ['/Qp', '/DAppVersion=' + version, '/DFileVersion=' + version.split('-')[0], '/DNumericVersion=' + version.split('-')[0] + '.0',
  '/DOutputDir=' + outputDir, '/DAppIcon=' + path.join(root, 'public/icon.ico'), '/DChineseLanguage=' + chinese,
  '/DBootstrapper=' + bootstrapper, '/DInstallNotes=' + notes, '/DPayloadManifest=' + manifest,
  path.join(root, 'native-windows/installer.iss')], { stdio: 'inherit', windowsHide: true })
const digest = hash(fs.readFileSync(installer))
fs.writeFileSync(installer + '.sha256', digest + '  ' + path.basename(installer) + '\n')
const result = { version, installer, sha256: digest, bytes: fs.statSync(installer).size, source, work,
  files: entries, bootstrapperSHA256: hash(fs.readFileSync(bootstrapper)), compilerVersion: '6.7.3' }
fs.writeFileSync('.local/latest-installer-build.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify({ installer, sha256: digest, bytes: result.bytes, files: entries.length }, null, 2))

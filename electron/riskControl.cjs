/**
 * 本地风控扫描（Electron 主进程）
 * 使用 Everything 命令行 es.exe 全盘检索：
 *  1) 开发环境探针：主流编程语言运行时 / 构建工具 / IDE / Android 开发相关文件。
 *     命中越多，“开发环境异常评分”越高：devScore = min(1, 命中数 / DEV_SCORE_DIVISOR)。
 *  2) 中育相关文件/文件夹：检索 zykj.org，但排除用户 AppData 目录。
 *     命中任一（且不在 AppData）→ zyScore = 1。
 * 结果缓存，供渲染进程在登录时读取并触发封禁。
 *
 * 部署要求：
 *  - 把 es.exe 放到 electron/resources/es/es.exe（打包后位于 resources/es/es.exe）；
 *    开发期可用环境变量 ES_EXE_PATH 指定，例如 ES_EXE_PATH=C:\...\es.exe。
 *  - 目标机器需运行 Everything 服务（es.exe 依赖之），否则查询返回空、评分归零。
 */
const { execFile } = require('node:child_process')
const util = require('node:util')
const path = require('node:path')
const fs = require('node:fs')

const execFileP = util.promisify(execFile)

// 开发环境探针清单（文件名，es.exe 按名检索）
const DEV_TARGETS = [
  // 运行时 / 编译器
  'node.exe', 'python.exe', 'python3.exe', 'java.exe', 'javac.exe',
  'go.exe', 'rustc.exe', 'cargo.exe', 'perl.exe', 'ruby.exe',
  'php.exe', 'dotnet.exe', 'cmake.exe', 'gcc.exe', 'clang.exe', 'tsc.exe',
  // 版本控制
  'git.exe', 'svn.exe', 'hg.exe',
  // IDE / 编辑器
  'Code.exe', 'devenv.exe', 'idea64.exe', 'pycharm64.exe', 'clion64.exe',
  'webstorm64.exe', 'eclipse.exe', 'studio64.exe', 'rider.exe',
  // Android 开发相关（含 gradlew.bat / ndk-build.cmd 等脚本）
  'adb.exe', 'emulator.exe', 'gradlew.bat', 'ndk-build.cmd', 'studio.exe'
]

const DEV_SCORE_DIVISOR = 8 // 命中 8 个即满分；4 个达 0.5 阈值
const ZY_KEYWORD = 'zykj.org'
const APPDATA_FRAGMENTS = ['appdata'] // 排除用户 AppData（浏览器缓存等）

let cached = null
let scanPromise = null

function locateEs() {
  if (process.env.ES_EXE_PATH && fs.existsSync(process.env.ES_EXE_PATH)) {
    return process.env.ES_EXE_PATH
  }
  const candidates = [
    // 打包后：electron-builder 把 es.exe 拷到 resources/es/
    path.join(process.resourcesPath || '', 'es', 'es.exe'),
    // 开发期：与 main.cjs / riskControl.cjs 同级的 electron/resources/es/
    path.join(__dirname, 'resources', 'es', 'es.exe')
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}

async function queryEs(esExe, term) {
  try {
    const { stdout } = await execFileP(esExe, [term], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 15000,
      windowsHide: true
    })
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  } catch (e) {
    // es.exe 查询失败（多为 Everything 服务未启动 / 无匹配），视作未命中
    return []
  }
}

function isInAppData(p) {
  const lower = p.toLowerCase()
  return APPDATA_FRAGMENTS.some((f) => lower.includes(f))
}

async function runRiskScan() {
  const esExe = locateEs()
  if (!esExe) {
    console.warn('[riskControl] 未找到 es.exe，风控扫描跳过（评分归零）')
    cached = { devScore: 0, zyScore: 0, devFound: [], zyFound: [], scanned: false }
    return cached
  }
  // 并行检索所有开发环境目标
  const devResults = await Promise.all(DEV_TARGETS.map((t) => queryEs(esExe, t)))
  const devFound = []
  devResults.forEach((hits, i) => {
    if (hits.length) devFound.push(DEV_TARGETS[i])
  })
  const devScore = Math.min(1, devFound.length / DEV_SCORE_DIVISOR)

  // 中育相关文件/文件夹（排除 AppData）
  const zyHits = (await queryEs(esExe, ZY_KEYWORD)).filter((p) => !isInAppData(p))
  const zyScore = zyHits.length ? 1 : 0

  cached = {
    devScore: Number(devScore.toFixed(3)),
    zyScore,
    devFound,
    zyFound: zyHits.slice(0, 50),
    scanned: true
  }
  console.log('[riskControl] 扫描完成', cached)
  return cached
}

async function getRiskScores() {
  if (cached) return cached
  if (!scanPromise) scanPromise = runRiskScan()
  return scanPromise
}

module.exports = { runRiskScan, getRiskScores }

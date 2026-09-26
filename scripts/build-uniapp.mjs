/**
 * 一键构建并打包到 uni-app 外壳：
 *   1) 以 plus 模式构建现有 Vite Web 工程（相对 base，激活 Native.js 路径）
 *   2) 把 dist/ 整目录覆盖到 uni-app 外壳工程的 hybrid/html/
 *
 * 外壳工程默认位于 D:/HBuilderProjects/ZhongYuToolBox_Uni_Test，
 * 如需换位置可用环境变量覆盖：UNI_SHELL_DIR=/your/path node scripts/build-uniapp.mjs
 *
 * 之后用 HBuilderX 打开该外壳工程发行 App，或在其目录执行：
 *   npm install
 *   npm run build:app-android   （CLI 打包 Android）
 */
import { execSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(root, 'dist')
const targetDir = process.env.UNI_SHELL_DIR
  ? resolve(process.env.UNI_SHELL_DIR)
  : resolve('D:/HBuilderProjects/ZhongYuToolBox_Uni_Test', 'hybrid', 'html')

console.log('[1/2] 构建 web 工程（build:plus）...')
execSync('npm run build:plus', { cwd: root, stdio: 'inherit' })

console.log('[2/2] 拷贝 dist ->', targetDir)
rmSync(targetDir, { recursive: true, force: true })
cpSync(distDir, targetDir, { recursive: true })

console.log('✅ 完成。下一步：')
console.log('   · 用 HBuilderX 打开 D:/HBuilderProjects/ZhongYuToolBox_Uni_Test 发行/运行 App；或')
console.log('   · cd D:/HBuilderProjects/ZhongYuToolBox_Uni_Test && npm install && npm run build:app-android')

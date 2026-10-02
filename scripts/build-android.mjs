import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { randomBytes, createHash } from 'node:crypto'
import { resolve, dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version
if(!/^\d+\.\d+\.\d+-aoki$/.test(version))throw new Error('Android 构建需要有效的 aoki 发布版本号')
const project=join(root,'native-android'), work=join(root,'.local','android-web')
const sdk=process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || join(homedir(),'.codex','tools','zytb-android-sdk')
const java=process.env.JAVA_HOME
function run(command,args,env={}) {
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'&&/\.(bat|cmd)$/i.test(command),env:{...process.env,...env}})
  if(result.error)throw result.error
  if(result.status!==0)throw new Error(`构建步骤失败：${command}（${result.status}）`)
}
function safeClear(path,parent) {
  const normalized=resolve(path), base=resolve(parent)
  if(normalized===base || !normalized.startsWith(base+sep))throw new Error('拒绝清理构建目录之外的路径')
  rmSync(normalized,{recursive:true,force:true})
}
function copyTree(source,target){
  mkdirSync(target,{recursive:true})
  for(const entry of readdirSync(source,{withFileTypes:true})){
    const from=join(source,entry.name),to=join(target,entry.name)
    if(entry.isDirectory())copyTree(from,to);else if(entry.isFile())copyFileSync(from,to)
  }
}
if(!existsSync(join(sdk,'platforms','android-35','android.jar')))throw new Error('需要 Android SDK platform 35。设置 ANDROID_SDK_ROOT，或参阅 native-android/README.md。')
const tools=join(sdk,'build-tools','35.0.0')
const gradleBase=join(homedir(),'.gradle','wrapper','dists','gradle-8.14.3-all')
const gradle=process.env.ZYTB_GRADLE || (existsSync(gradleBase)?readdirSync(gradleBase).map(p=>join(gradleBase,p,'gradle-8.14.3','bin',process.platform==='win32'?'gradle.bat':'gradle')).find(existsSync):null)
if(!gradle)throw new Error('需要 Gradle 8.14.3；可通过 ZYTB_GRADLE 指定可执行文件。')
console.log('[1/4] 构建 aoki Android 界面')
if(!process.argv.includes('--skip-web')) {
run(join(root,'node_modules','.bin',process.platform==='win32'?'vue-tsc.cmd':'vue-tsc'),['-b'])
run(process.execPath,[join(root,'node_modules','vite','bin','vite.js'),'build','--mode','android','--outDir',work])
}
copyFileSync(join(project,'bridge.js'),join(work,'android-bridge.js'))
const html=readFileSync(join(work,'index.html'),'utf8').replace(/\s*<script src="\.\/android-bridge\.js"><\/script>/g,'').replace('<head>','<head>\n    <script src="./android-bridge.js"></script>')
writeFileSync(join(work,'index.html'),html)
const assets=join(project,'app','build','generated','web-assets')
console.log('复制包内资源...')
safeClear(assets,join(project,'app','build'));copyTree(work,assets)
// No AppData, browser profile, tokens or user notes are copied into this directory.
writeFileSync(join(project,'local.properties'),`sdk.dir=${sdk.replace(/\\/g,'/')}\n`)
console.log('[2/4] 构建原生 Android 壳')
run(gradle,['-p',project,'--no-daemon','--console=plain','assembleRelease'])
console.log('[3/4] 使用本机专用密钥签名（密钥不进入 APK 或源码）')
const signing=join(homedir(),'.codex','signing','zhongyu-toolbox-aoki-android')
mkdirSync(signing,{recursive:true})
const config=join(signing,'signing.json'), key=join(signing,'release.jks')
if(!existsSync(config))writeFileSync(config,JSON.stringify({password:randomBytes(32).toString('base64url')},null,2))
const {password}=JSON.parse(readFileSync(config,'utf8'))
const signingEnv={ZYTB_ANDROID_STORE_PASS:password}
if(!existsSync(key))run(java?join(java,'bin',process.platform==='win32'?'keytool.exe':'keytool'):'keytool',['-genkeypair','-keystore',key,'-alias','aoki','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=aoki, OU=ZhongYuToolBox, O=aoki','-storepass:env','ZYTB_ANDROID_STORE_PASS','-keypass:env','ZYTB_ANDROID_STORE_PASS'],signingEnv)
const output=join(root,'release','android');mkdirSync(output,{recursive:true})
const unsigned=join(project,'app','build','outputs','apk','release','app-release-unsigned.apk')
const aligned=join(output,'toolbox-aligned.apk')
const apk=join(output,`ZhongYuToolBox-aoki-${version.split('-')[0]}-Android.apk`)
run(join(tools,process.platform==='win32'?'zipalign.exe':'zipalign'),['-f','-p','4',unsigned,aligned])
run(join(tools,process.platform==='win32'?'apksigner.bat':'apksigner'),['sign','--ks',key,'--ks-key-alias','aoki','--ks-pass','env:ZYTB_ANDROID_STORE_PASS','--key-pass','env:ZYTB_ANDROID_STORE_PASS','--out',apk,aligned],signingEnv)
console.log('[4/4] 验证签名和打包信息')
run(join(tools,process.platform==='win32'?'apksigner.bat':'apksigner'),['verify','--verbose','--print-certs',apk])
// aapt's Windows zip reader cannot open non-ASCII absolute paths.
const manifestCopy=join(signing,'verify.apk');copyFileSync(apk,manifestCopy)
try { run(join(tools,process.platform==='win32'?'aapt.exe':'aapt'),['dump','badging',manifestCopy]) }
finally { rmSync(manifestCopy) }
const bytes=readFileSync(apk), hash=createHash('sha256').update(bytes).digest('hex')
writeFileSync(join(output,'SHA256SUMS.txt'),`${hash}  ${apk.split(/[\\/]/).pop()}\n`)
rmSync(aligned);console.log(`完成：${apk}\nSHA256: ${hash}`)

import {spawnSync} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve,dirname,join,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'), project=join(root,'native-ios'), output=join(root,'release','ios')
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version.split('-')[0]
const beta=JSON.parse(readFileSync(join(root,'src/config/iosRelease.json'),'utf8')).beta
if(!Number.isSafeInteger(beta)||beta<1)throw Error('无效 iOS beta 序号')
const releaseRepository=process.env.VITE_RELEASE_REPOSITORY==='Loshop-Studio/ZhongYuToolBox_Web'?'Loshop-Studio/ZhongYuToolBox_Web':'nickfox395/ZhongYuToolBox_Web'
const authorStats=process.env.VITE_AUTHOR_STATS==='true'
if(releaseRepository.startsWith('Loshop-Studio/')&&!authorStats)throw Error('上游发行包必须保留作者用户量统计')
const webOnly=process.argv.includes('--web-only'), simulator=process.argv.includes('--simulator')
if(!webOnly && process.platform!=='darwin')throw Error('IPA 需要 macOS + Xcode 26 或更新版本。Windows 可运行 npm run build:ios -- --web-only；完整 IPA 请使用 GitHub Actions 的 Build iOS IPA。')
function run(command,args,options={}){console.log('运行：'+command+' '+args.join(' '));const r=spawnSync(command,args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'&&/\.(cmd|bat)$/.test(command),...options});if(r.error)throw r.error;if(r.status!==0)throw Error(`构建步骤失败：${command} (${r.status}, ${r.signal})`)}
const uploadQa=simulator && process.argv.includes('--upload-qa')
const work=join(root,'.local',uploadQa?'ios-simulator-web-qa':'ios-web')
function copyTree(source,target) {
  mkdirSync(target,{recursive:true})
  for(const entry of readdirSync(source,{withFileTypes:true})) {
    const from=join(source,entry.name), to=join(target,entry.name)
    if(entry.isDirectory())copyTree(from,to)
    else if(entry.isFile())copyFileSync(from,to)
    else throw Error('不允许打包资源中的符号链接：'+from)
  }
}
if (!process.argv.includes('--skip-web') || uploadQa) {
  run(join(root,'node_modules','.bin',process.platform==='win32'?'vue-tsc.cmd':'vue-tsc'),['-b'])
  run(process.execPath,[join(root,'node_modules','vite','bin','vite.js'),'build','--mode','ios','--outDir',work],{env:{...process.env,ZYTB_IOS_UPLOAD_QA:uploadQa?'1':'0'}})
}
if(!existsSync(join(work,'index.html')))throw Error('缺少 iOS 前端构建产物')
const assets=join(project,'WebAssets');if(!resolve(assets).startsWith(resolve(project)+sep))throw Error('无效构建目录')
if(existsSync(assets))rmSync(assets,{recursive:true,force:true});copyTree(work,assets)
run(process.execPath,[join(root,'scripts','generate-ios-project.mjs')])
if(webOnly){console.log('iOS 前端与 Xcode 工程已准备；尚未编译 IPA。');process.exit(0)}
const xcode=spawnSync('xcodebuild',['-version'],{encoding:'utf8'});console.log(xcode.stdout)
if(xcode.status!==0 || Number(xcode.stdout.match(/Xcode (\d+)/)?.[1]||0)<26)throw Error('此 iOS 构建配置需要 Xcode 26+ SDK')
const icon=join(project,'Assets.xcassets','AppIcon.appiconset');mkdirSync(icon,{recursive:true})
run('swift',[join(root,'scripts','generate-ios-icon.swift'),join(root,'public','icon.png'),join(icon,'AppIcon.png')])
writeFileSync(join(icon,'Contents.json'),JSON.stringify({images:[{filename:'AppIcon.png',idiom:'universal',platform:'ios',size:'1024x1024'}],info:{author:'aoki',version:1}},null,2))
const derived=join(root,'.local',simulator?'ios-simulator':'ios-device')
run('xcodebuild',['-project',join(project,'ZhongYuToolBox.xcodeproj'),'-scheme','ZhongYuToolBox','-configuration','Release','-sdk',simulator?'iphonesimulator':'iphoneos','-destination',simulator?'generic/platform=iOS Simulator':'generic/platform=iOS','-derivedDataPath',derived,'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO','build'])
const app=join(derived,'Build','Products',simulator?'Release-iphonesimulator':'Release-iphoneos','ZhongYuToolBox.app')
if(!existsSync(join(app,'ZhongYuToolBox')))throw Error('Xcode 未生成应用可执行文件')
run('plutil',['-lint',join(app,'Info.plist')]);run('file',[join(app,'ZhongYuToolBox')])
mkdirSync(output,{recursive:true})
if(simulator){copyTree(app,join(output,'ZhongYuToolBox-Simulator.app'));console.log('模拟器 APP 构建完成');process.exit(0)}
const stage=join(root,'.local','ios-package');if(existsSync(stage))rmSync(stage,{recursive:true,force:true});mkdirSync(join(stage,'Payload'),{recursive:true});copyTree(app,join(stage,'Payload','ZhongYuToolBox.app'))
const executable=spawnSync('lipo',['-archs',join(app,'ZhongYuToolBox')],{encoding:'utf8'})
if(executable.status!==0||!executable.stdout.includes('arm64'))throw Error('IPA 缺少 iPhone/iPad arm64 可执行文件')
const forbidden=/^(qa(?:-|\.)|native-qa|ios-upload-qa.*|.*\.(p12|mobileprovision|jks|keystore)|signing\.json|qa-result\.json)$/i
function inspect(path){for(const e of readdirSync(path,{withFileTypes:true})){if(forbidden.test(e.name))throw Error('禁止打包测试页面或签名资料：'+e.name);if(e.isDirectory())inspect(join(path,e.name))}}
inspect(stage)
const edition=process.env.VITE_RELEASE_REPOSITORY==='Loshop-Studio/ZhongYuToolBox_Web'?'Loshop':'aoki'
const ipa=join(output,`ZhongYuToolBox-${edition}-${version}-iOS-beta${beta}-unsigned.ipa`);rmSync(ipa,{force:true});run('zip',['-q','-r',ipa,'Payload'],{cwd:stage})
const hash=createHash('sha256').update(readFileSync(ipa)).digest('hex');writeFileSync(join(output,'SHA256SUMS.txt'),hash+'  '+ipa.split(sep).pop()+'\n')
copyFileSync(join(project,'README.md'),join(output,'IOS_INSTALL.md'))
const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'})
if(revision.status!==0)throw Error('无法记录构建源码')
writeFileSync(join(output,'BUILD_INFO.json'),JSON.stringify({version,beta,releaseRepository,authorStats,source:revision.stdout.trim(),ipa:ipa.split(sep).pop(),sha256:hash},null,2)+'\n')
writeFileSync(join(output,'IOS_INSTALL.md'),'\n\n本包发行仓库：'+releaseRepository+'；版本 '+version+' Beta '+beta+'；作者用户量统计：'+(authorStats?'保留并启用（统计失败不影响登录）':'关闭')+'。\n',{flag:'a'})
console.log('未签名 IPA：'+ipa+'\nSHA256：'+hash+'\n请在爱思助手中重新签名后安装。')

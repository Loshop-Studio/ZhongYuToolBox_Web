import {spawnSync} from 'node:child_process'
import {mkdirSync, existsSync, readFileSync} from 'node:fs'
import {resolve, join} from 'node:path'
if(process.platform !== 'darwin') throw Error('Simulator verification requires macOS / Xcode')
const app=resolve('release/ios/ZhongYuToolBox-Simulator.app'), output=resolve('release/ios/test-evidence')
if(!existsSync(app)) throw Error('Build the simulator app first')
mkdirSync(output,{recursive:true})
function run(args) {
 const result=spawnSync('xcrun',['simctl',...args],{encoding:'utf8'})
 if(result.status!==0) throw Error(result.stderr || `simctl failed: ${args.join(' ')}`)
 console.log(result.stdout.trim()); return result.stdout
}
const devices=JSON.parse(run(['list','devices','available','--json'])).devices
const ios26=Object.entries(devices).filter(([key])=>/iOS-26/.test(key)).flatMap(([,items])=>items)
for(const kind of ['iPhone','iPad']) {
 const device=ios26.find(d=>d.name.startsWith(kind)&&d.state==='Shutdown')
 if(!device) throw Error(`No iOS 26 ${kind} simulator available`)
 try {
  run(['boot',device.udid]); run(['bootstatus',device.udid,'-b'])
  run(['ui',device.udid,'appearance','light'])
  run(['status_bar',device.udid,'override','--time','9:41','--batteryState','charged','--batteryLevel','100'])
  run(['install',device.udid,app])
  run(['launch',device.udid,'com.loshop.zhongyutoolbox.ios'])
  await new Promise(resolve=>setTimeout(resolve,15000))
  run(['io',device.udid,'screenshot',join(output,`${kind}-light.png`)])
  run(['ui',device.udid,'appearance','dark'])
  const light=readFileSync(join(output,`${kind}-light.png`)), darkPath=join(output,`${kind}-dark.png`)
  let changed=false
  for(let attempt=0;attempt<5;attempt++) {
   await new Promise(resolve=>setTimeout(resolve,3000))
   run(['io',device.udid,'screenshot',darkPath])
   if(!readFileSync(darkPath).equals(light)){changed=true;break}
  }
  if(!changed)throw Error(`${kind} did not redraw after the system appearance changed`)
  console.log(`Launched ${device.name}; screenshots require visual inspection`)
  run(['ui',device.udid,'appearance','light'])
  {
   const bundle=join(output,kind === 'iPhone' ? 'NavigationUI.xcresult' : 'iPadLandscapeUI.xcresult')
   const cases=kind === 'iPhone'
    ? ['testBoardReplyFitsPhoneAndSupportsEditing','testNativeGroupsAndSystemGlass','testColumnLayoutImagesAndNativeBack']
    : ['testIPadLandscapeContentFitsScreen']
   const test=spawnSync('xcodebuild',[
    '-project','native-ios/ZhongYuToolBox.xcodeproj','-scheme','ZhongYuToolBox',
    '-configuration','Release','-destination',`platform=iOS Simulator,id=${device.udid}`,
    '-derivedDataPath','.local/ios-simulator',
    '-resultBundlePath',bundle,
    '-parallel-testing-enabled','NO',...cases.map(name=>`-only-testing:NavigationUITests/NavigationUITests/${name}`),
    'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO','test'
   ],{stdio:'inherit'})
   if(test.error)throw test.error
   if(test.status!==0)throw Error(`Navigation UI test failed (${test.status}, ${test.signal})`)
   const attachments=spawnSync('xcrun',['xcresulttool','export','attachments','--path',bundle,'--output-path',join(output,`${kind}-attachments`)],{stdio:'inherit'})
   if(attachments.error)throw attachments.error
   if(attachments.status!==0)throw Error('Could not export actual XCTest screenshots')
  }
 } finally { run(['shutdown',device.udid]) }
}

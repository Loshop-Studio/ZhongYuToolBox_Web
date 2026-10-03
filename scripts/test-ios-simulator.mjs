import {spawnSync} from 'node:child_process'
import {mkdirSync, existsSync} from 'node:fs'
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
  run(['status_bar',device.udid,'override','--time','9:41','--batteryState','charged','--batteryLevel','100'])
  run(['install',device.udid,app])
  run(['launch',device.udid,'com.aoki.zhongyutoolbox.ios'])
  await new Promise(resolve=>setTimeout(resolve,15000))
  run(['io',device.udid,'screenshot',join(output,`${kind}-light.png`)])
  run(['ui',device.udid,'appearance','dark'])
  await new Promise(resolve=>setTimeout(resolve,3000))
  run(['io',device.udid,'screenshot',join(output,`${kind}-dark.png`)])
  console.log(`Launched ${device.name}; screenshots require visual inspection`)
 } finally { run(['shutdown',device.udid]) }
}

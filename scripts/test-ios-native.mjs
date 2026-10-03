import {spawnSync} from 'node:child_process'
import {mkdirSync,cpSync} from 'node:fs'
import {resolve,join} from 'node:path'
if(process.platform!=='darwin'){console.log('SKIP: Swift/iOS 原生编译及资产服务器验证需要 macOS；此处不宣称通过。');process.exit(0)}
const work=resolve('.test-output/ios-native');mkdirSync(work,{recursive:true});cpSync('tests/ios-native-main.swift',join(work,'main.swift'))
const binary=join(work,'ios-native-test')
for(const [command,args] of [['swiftc',['-swift-version','5','native-ios/HostPolicy.swift','native-ios/LocalAssetServer.swift',join(work,'main.swift'),'-o',binary]],[binary,[]]]){
 const result=spawnSync(command,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status)
}

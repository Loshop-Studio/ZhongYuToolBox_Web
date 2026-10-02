// Read from the seven user-supplied official APKs on 2026-10-02.
// Hashes identify these exact files; they are not a claim of latest server versions.
export const OFFICIAL_APK_CATALOG = [
  { name: '中育云笔记', packageName: 'com.friday.cloudsnote', versionName: '1.13.3', versionCode: 11303, size: 76058716, sha256: '290335284f324307342e932ffdcf3ec5390ea5ad5422d6c1af0e3eb0fea710e0', aliases: '云笔记' },
  { name: '优课畅学', packageName: 'com.zhongyukejiao.learningexpert', versionName: '1.1.6', versionCode: 10106, size: 70127741, sha256: 'f3e82176781e2a9199b827a691dfd6203483055402d5ae0eeab47020ca313169', aliases: '优客畅学' },
  { name: '新测评', packageName: 'com.zykj.evaluation', versionName: '2.4.8', versionCode: 20408, size: 46899568, sha256: '99e07683d3983242510b7f3d41bb280bb3f4672bb655c9c3f7a5137d45f9c149', aliases: '' },
  { name: '错题本', packageName: 'com.zykj.mistake', versionName: '1.2.5', versionCode: 10205, size: 44678998, sha256: 'd88208c20bcb0693c68d53073c70ed2bebe8ef733dbfd3893db5676c1849e7da', aliases: '' },
  { name: '在线专栏', packageName: 'com.zykj.subscriber', versionName: '1.3.4', versionCode: 1304, size: 27877682, sha256: 'b571a8d19d808d3200b26689036145a1d0924c0170db035a2233725030b8ccce', aliases: '浏览器' },
  { name: '随身答', packageName: 'com.zykj.student.dialogue', versionName: '1.1.3', versionCode: 10103, size: 35672040, sha256: '230119aba61abd5a4c049c3cd9ecb143991090c16d1f74e93a37a1bb338a1ce3', aliases: '随身答学生版' },
  { name: '中育桌面', packageName: 'com.zykj.manage', versionName: '1.1.2', versionCode: 10102, size: 34142501, sha256: 'fee589550eefd68c73b3e6f61b2d3af0697388d3f6be70ef06d7334467c7dc52', aliases: '图库 用户中心 桌面' }
]
export type OfficialApkReference = typeof OFFICIAL_APK_CATALOG[number]

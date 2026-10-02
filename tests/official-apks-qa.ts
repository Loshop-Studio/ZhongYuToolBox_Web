import JSZip from 'jszip'
import { OFFICIAL_APK_CATALOG } from '../src/api/officialApkCatalog'
import { identifyOfficialApk, importOfficialApks, readLocalOfficialApks } from '../src/utils/officialApks'

export async function officialApksQa(check: (ok: boolean, message: string) => void) {
  const app = OFFICIAL_APK_CATALOG[0], saved = { ...app }
  const zip = new JSZip(); zip.file('AndroidManifest.xml', 'QA'); zip.file('classes.dex', 'QA_ONLY')
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), n => n.toString(16).padStart(2, '0')).join('')
  Object.assign(app, { size: bytes.length, sha256 })
  const archive = new JSZip(); archive.file('incorrect-label.apk', bytes); archive.file('unknown.apk', 'bad')
  try {
    const result = await importOfficialApks(new File([await archive.generateAsync({ type: 'uint8array' }) as BlobPart], 'apps.zip'))
    check(result.imported.join() === app.packageName && result.failed.length === 1, 'ZIP 按文件摘要识别应用，错误文件名单独报告')
    const stored = (await readLocalOfficialApks()).find(item => item.packageName === app.packageName)!
    check(stored.blob.size === bytes.length && stored.sha256 === sha256 && (await identifyOfficialApk(new Uint8Array(await stored.blob.arrayBuffer()))).packageName === app.packageName, 'IndexedDB 保留完整 APK，重新读取后摘要仍匹配')
    const corrupt = bytes.slice(); corrupt[0] ^= 1
    let rejected = false; try { await identifyOfficialApk(corrupt) } catch { rejected = true }
    check(rejected, '安装包被修改即拒绝，不根据文件名信任身份')
    const single = await importOfficialApks(new File([bytes as BlobPart], 'desktop.apk.1'))
    check(single.imported.length === 1, 'APK 的 .1 后缀不影响本地识别')
  } finally {
    Object.assign(app, saved)
    // Only delete this synthetic QA record, in the isolated QA profile.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('aoki-official-apks', 1)
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const database = open.result, tx = database.transaction('apks', 'readwrite'), store = tx.objectStore('apks')
        const get = store.get(app.packageName)
        get.onsuccess = () => { if (get.result?.sha256 === sha256) store.delete(app.packageName) }
        tx.oncomplete = () => { database.close(); resolve() }; tx.onerror = () => reject(tx.error)
      }
    })
  }
}

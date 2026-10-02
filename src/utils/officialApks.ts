import JSZip from 'jszip'
import { OFFICIAL_APK_CATALOG, type OfficialApkReference } from '@/api/officialApkCatalog'

export interface LocalOfficialApk extends OfficialApkReference { blob: Blob }
let database: Promise<IDBDatabase> | undefined
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('aoki-official-apks', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('apks', { keyPath: 'packageName' })
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => { database = undefined; reject(open.error) }
  })
}
export async function readLocalOfficialApks(): Promise<LocalOfficialApk[]> {
  const database = await db()
  return new Promise((resolve, reject) => {
    const read = database.transaction('apks').objectStore('apks').getAll()
    read.onsuccess = () => resolve(read.result)
    read.onerror = () => reject(read.error)
  })
}
async function store(apk: LocalOfficialApk) {
  const database = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('apks', 'readwrite')
    tx.objectStore('apks').put(apk)
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机存储空间不足'))
  })
}
export async function identifyOfficialApk(bytes: Uint8Array): Promise<OfficialApkReference> {
  const candidates = OFFICIAL_APK_CATALOG.filter(app => app.size === bytes.byteLength)
  if (!candidates.length) throw new Error('安装包不在已核实目录中，或文件不完整')
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  const sha = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
  const app = candidates.find(app => app.sha256 === sha)
  if (!app) throw new Error('安装包 SHA-256 不匹配，文件未导入')
  return app
}
/** Import exact, locally supplied binaries. Never execute APKs or infer identity from filenames. */
export async function importOfficialApks(file: File, onProgress: (done: number, total: number) => void = () => {}) {
  if (file.size > 350 * 1024 * 1024) throw new Error('文件超过 350 MiB，请分别导入 APK')
  const imported: string[] = [], failed: string[] = []
  const save = async (name: string, bytes: Uint8Array) => {
    try {
      const app = await identifyOfficialApk(bytes)
      await store({ ...app, blob: new Blob([bytes as BlobPart], { type: 'application/vnd.android.package-archive' }) })
      if (!imported.includes(app.packageName)) imported.push(app.packageName)
    } catch (e) { failed.push(name + '：' + (e as Error).message) }
  }
  if (/\.zip$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const entries = Object.values(zip.files).filter(e => !e.dir && /\.apk(?:\.1)?$/i.test(e.name))
    if (!entries.length || entries.length > 30) throw new Error('压缩包需包含 1–30 个 APK')
    for (const [index, entry] of entries.entries()) {
      // JSZip exposes the advertised uncompressed size on loaded entries. Reject oversized entries before inflation.
      const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
      if (!size || !OFFICIAL_APK_CATALOG.some(app => app.size === size)) failed.push(entry.name + '：安装包大小不在已核实目录中')
      else await save(entry.name, await entry.async('uint8array'))
      onProgress(index + 1, entries.length)
    }
  } else {
    if (!OFFICIAL_APK_CATALOG.some(app => app.size === file.size)) throw new Error('安装包大小不在已核实目录中')
    await save(file.name, new Uint8Array(await file.arrayBuffer())); onProgress(1, 1)
  }
  return { imported, failed }
}

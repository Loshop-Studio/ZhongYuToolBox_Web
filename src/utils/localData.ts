/** IndexedDB holds snapshots only; tokens and login passwords are never copied here. */
let database: Promise<IDBDatabase> | undefined
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('aoki-toolbox-data', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('records', { keyPath: 'key' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { database = undefined; reject(req.error) }
  })
}
export async function localGet<T>(key: string): Promise<T | undefined> {
  const database = await db()
  return new Promise((resolve, reject) => {
    const req = database.transaction('records').objectStore('records').get(key)
    req.onsuccess = () => resolve(req.result?.value)
    req.onerror = () => reject(req.error)
  })
}
export async function localPut(key: string, value: unknown): Promise<void> {
  const database = await db()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('records', 'readwrite')
    tx.objectStore('records').put({ key, value })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('本地保存失败'))
  })
}
export function accountKey(): string {
  const base = localStorage.getItem('apiBaseUrl') || ''
  const user = localStorage.getItem('userId') || ''
  if (!base || !user) throw new Error('请先登录，无法识别当前账号')
  return `${new URL(base).origin}|${user}`
}

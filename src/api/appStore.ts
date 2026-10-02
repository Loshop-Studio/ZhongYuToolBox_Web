import JSZip from 'jszip'
import { request } from '@/utils/request'
import { OFFICIAL_APK_CATALOG } from './officialApkCatalog'

// Package identities verified against official APKs and AppStore/CheckUpdateAsync.
// This is a list of common student apps, not an enumeration of the entire store.
export const STUDENT_APPS = OFFICIAL_APK_CATALOG

export interface OfficialApp {
  name: string
  packageName: string
  versionName: string
  versionCode: number
  fileUrl: string
  size: number
  icon: string
}

export function officialResourceUrl(value: string): string {
  const url = new URL(value)
  const official = /(^|\.)zykj\.org$/i.test(url.hostname) || /^ezy-[a-z0-9-]+\.oss-cn-[a-z0-9-]+\.aliyuncs\.com$/i.test(url.hostname)
  if (!official || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('官方接口返回了不支持的资源地址')
  }
  return url.href
}

export async function getStudentApp(packageName: string, baseUrl: string, signal?: AbortSignal): Promise<OfficialApp | null> {
  const pkg = packageName.trim()
  if (!/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*){2,}$/.test(pkg)) throw new Error('请输入有效的 Android 包名，例如 com.zykj.mistake')
  const query = new URLSearchParams({ packageName: pkg, version: '0', appType: '0' })
  // This public update contract does not require credentials or device registration.
  const response = await request<{ result: any }>(`/api/services/app/AppStore/CheckUpdateAsync?${query}`, {
    baseUrl, method: 'GET', skipAuth: true, skipRecover: true, signal, credentials: 'omit'
  })
  const app = response.result
  if (!app || app.disabled === true) return null
  if (app.packageName !== pkg || Number(app.appType) !== 0) throw new Error('官方返回的包名或客户端类型不匹配')
  const size = Number(app.size)
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_APK_SIZE) throw new Error('官方安装包大小无效')
  let icon = ''
  try { if (app.icon) icon = officialResourceUrl(app.icon) } catch { /* optional icon */ }
  return {
    name: String(app.name || pkg), packageName: pkg, versionName: String(app.versionName || ''),
    versionCode: Number(app.versionCode || 0), fileUrl: officialResourceUrl(app.fileUrl), size, icon
  }
}

const MAX_APK_SIZE = 512 * 1024 * 1024

export function appFilename(app: OfficialApp): string {
  return `${app.name}-${app.versionName || app.versionCode}-${app.packageName}.apk`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
}

export async function downloadOfficialApk(app: OfficialApp, signal: AbortSignal, progress: (received: number, total: number) => void) {
  const response = await fetch(officialResourceUrl(app.fileUrl), { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('APK 下载失败：HTTP ' + response.status)
  if (response.url) officialResourceUrl(response.url)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('当前环境不支持流式下载，请复制官方链接下载')
  const chunks: Uint8Array[] = []
  let received = 0
  progress(0, app.size)
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > app.size || received > MAX_APK_SIZE) throw new Error('下载大小超出官方记录，请刷新版本后重试')
      chunks.push(value)
      progress(received, app.size)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  signal.throwIfAborted()
  if (received !== app.size) throw new Error('安装包不完整：下载大小与官方记录不一致，请刷新版本后重试')
  const blob = new Blob(chunks as BlobPart[], { type: 'application/vnd.android.package-archive' })
  const bytes = await blob.arrayBuffer()
  const zip = await JSZip.loadAsync(bytes)
  if (!zip.file('AndroidManifest.xml') || !Object.keys(zip.files).some(name => /^classes(?:\d+)?\.dex$/.test(name))) {
    throw new Error('下载内容不是有效的 Android APK')
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  signal.throwIfAborted()
  const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
  return { blob, sha256 }
}

import { PLATFORM, APP_VERSION, TRACK_API } from '@/config'
import { setBlock } from '@/stores/block'

export interface VersionInfo {
  version: string
  message: string
}
export interface TrackVersion {
  electron: VersionInfo
  uniapp: VersionInfo
}

/**
 * 上报一次登录（含自动重新登录），并接入风控：
 * 命中封禁时后端返回 403，返回 { banned: true, message }。
 * 上报失败不影响主流程（静默忽略）。
 */
export async function reportLogin(
  school: string,
  username: string
): Promise<{ banned: boolean; message?: string } | null> {
  if (!school || !username) return null
  try {
    const resp = await fetch(`${TRACK_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school, username })
    })
    if (resp.status === 403) {
      const data = (await resp.json().catch(() => ({}))) as { message?: string }
      return { banned: true, message: data.message || '该账号已被管理员封禁' }
    }
    if (!resp.ok) return null
    return { banned: false }
  } catch {
    return null
  }
}

/** 拉取服务器版本配置 */
export async function fetchVersion(): Promise<TrackVersion | null> {
  try {
    const resp = await fetch(`${TRACK_API}/version`)
    if (!resp.ok) return null
    return (await resp.json()) as TrackVersion
  } catch {
    return null
  }
}

/**
 * 更新分发检测：仅 electron / uniapp 生效（浏览器版不做强制更新）。
 * 与服务器版本不一致则弹窗阻止继续使用。
 */
export async function checkVersion(): Promise<void> {
  if (PLATFORM === 'browser') return
  const data = await fetchVersion()
  if (!data) return
  const info = PLATFORM === 'plus' ? data.uniapp : data.electron
  if (info && info.version && info.version !== APP_VERSION) {
    setBlock('发现新版本', info.message || '请更新到最新版本后继续使用。', 'version')
  }
}

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
  username: string,
  deviceId?: string
): Promise<{ banned: boolean; message?: string } | null> {
  if (!school || !username) return null
  try {
    const resp = await fetch(`${TRACK_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school, username, deviceId: deviceId || '' })
    })
    if (resp.status === 403) {
      const data = (await resp.json().catch(() => ({}))) as { message?: string }
      return { banned: true, message: data.message || '该账号已被管理员封禁' }
    }
    if (!resp.ok) return null
    return { banned: false }
  } catch (e) {
    // 上报失败不应阻断主流程，但记录日志方便排查（为何没上报）
    console.error('[track] reportLogin 失败（未上报登录/封禁检查）:', e)
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
 * 风控自动封禁：客户端判定环境异常（开发环境评分>0.5 或 中育评分>0.3）后，
 * 上报后台触发"封禁用户 + 连坐封禁设备"。上报失败静默忽略，不影响主流程。
 */
export async function reportRiskBan(
  school: string,
  username: string,
  deviceId: string,
  devScore: number,
  zyScore: number,
  devFound: string[] = [],
  zyFound: string[] = []
): Promise<void> {
  if (!school || !username || !deviceId) return
  try {
    await fetch(`${TRACK_API}/client/ban-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school, username, deviceId, devScore, zyScore, devFound, zyFound })
    })
  } catch (e) {
    console.error('[track] reportRiskBan 失败（未上报风控封禁）:', e)
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

/**
 * 客户端风控总开关（kill-switch）。
 * GET {TRACK_API}/enable：
 *   - 返回 {"enable":false} → 禁用客户端的「检测 + 主动封禁」功能
 *   - 返回 404（或正常但非 false）→ 不禁用（正常开启）
 * 网络异常 / 接口异常时保守按「正常开启」处理，避免误关防护导致漏拦。
 *
 * 注意：该开关只影响客户端自主行为（本地异常检测、reportRiskBan 主动上报），
 * 不影响被动封禁查询（reportLogin：服务端已封则照常阻断，属于服从服务端而非主动）。
 */
let clientGuardEnabled = true

export async function fetchClientEnabled(): Promise<boolean> {
  try {
    const resp = await fetch(`${TRACK_API}/enable`)
    if (resp.status === 404) {
      clientGuardEnabled = true
    } else if (resp.ok) {
      const data = (await resp.json().catch(() => ({}))) as { enable?: boolean }
      clientGuardEnabled = data.enable !== false
    } else {
      clientGuardEnabled = true
    }
  } catch (e) {
    console.error('[track] fetchClientEnabled 失败（按正常开启处理）:', e)
    clientGuardEnabled = true
  }
  return clientGuardEnabled
}

export function isClientGuardEnabled(): boolean {
  return clientGuardEnabled
}

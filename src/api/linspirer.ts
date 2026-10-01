/**
 * 领创 (Linspirer) 模块接口（复刻 linspirer.js）
 * 独立于中育功能，仅共享用户名。所有请求经 AES-CBC 加密，响应为加密或明文。
 */
import { LINSPIRER } from '@/config'
import { linspirerEncrypt, linspirerDecrypt, md5 } from '@/utils/crypto'

export interface LinspirerApp {
  id?: string
  appid?: string
  name?: string
  appname?: string
  packagename?: string
  pkg?: string
  iconpath?: string
  icon?: string
  appicon?: string
  path?: string
  version?: string
  appversion?: string
  description?: string
  desc?: string
  _source?: string
  [key: string]: any
}

export interface LinspirerSession {
  swdid: string
  account: string
  model: string
}

/** JSON-RPC 信封调用（params 加密） */
async function linspirerCall<T = any>(
  method: string,
  paramsObj: Record<string, any>
): Promise<T> {
  const paramsJson = JSON.stringify(paramsObj)
  const envelope = {
    id: 1,
    '!version': 6,
    jsonrpc: '2.0',
    is_encrypt: true,
    client_version: LINSPIRER.CLIENT_VERSION,
    method,
    params: linspirerEncrypt(paramsJson)
  }

  const resp = await fetch(LINSPIRER.API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope)
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
  }

  const text = await resp.text()
  let result: any
  try {
    result = JSON.parse(linspirerDecrypt(text.trim()))
  } catch {
    result = JSON.parse(text)
  }

  if (result.code !== 0) {
    throw new Error(result.msg || result.message || JSON.stringify(result))
  }
  return result as T
}

/** 绑定设备 */
export async function bindDevice(
  swdid: string,
  account: string,
  model: string
): Promise<any> {
  const deviceInfo = {
    brand: '',
    deviceid: '',
    email: account,
    isrooted: false,
    model,
    romavailablesize: 0,
    romtotalsize: 0,
    romversion: '',
    simserialnumber: 'unknown',
    swdid,
    systemversion: '',
    token: '',
    wifimacaddress: ''
  }
  return linspirerCall('com.linspirer.device.setdevice', deviceInfo)
}

/** 获取全部应用（策略应用 + 兴趣应用） */
export async function getAllApps(
  swdid: string,
  account: string,
  model: string
): Promise<LinspirerApp[]> {
  const inner = {
    swdid,
    email: account,
    model,
    launcher_version: LINSPIRER.CLIENT_VERSION
  }
  const result = await linspirerCall<any>('com.linspirer.tactics.gettactics', inner)
  const data = result.data || {}
  const apps1 = (data.app_tactics && data.app_tactics.applist) || []
  const apps2 = data.interest_applist || []
  apps1.forEach((a: LinspirerApp) => (a._source = '策略应用'))
  apps2.forEach((a: LinspirerApp) => (a._source = '兴趣应用'))
  return [...apps1, ...apps2]
}

/** 获取应用详情 */
export async function getAppDetail(
  swdid: string,
  account: string,
  model: string,
  appid: string
): Promise<any> {
  const inner = {
    swdid,
    email: account,
    model,
    launcher_version: LINSPIRER.CLIENT_VERSION,
    appid
  }
  return linspirerCall('com.linspirer.app.getdetail', inner)
}

/** 获取用户信息（用于密码计算中的 studentId） */
export async function getUserInfo(
  swdid: string,
  account: string,
  model: string
): Promise<any> {
  const inner = {
    swdid,
    email: account,
    model,
    launcher_version: LINSPIRER.CLIENT_VERSION
  }
  const result = await linspirerCall<any>('com.linspirer.user.getuserinfo', inner)
  return result.data
}

/** 领创静态资源代理（cloud.linspirer.com 的资源走 API_BASE） */
export function linspirerProxyUrl(url?: string): string {
  if (!url) return ''
  return url
    .replace('http://cloud.linspirer.com:880', LINSPIRER.API_BASE)
    .replace('https://cloud.linspirer.com:883', LINSPIRER.API_BASE)
}

/** 密码计算使用小写设备号，同时清理复制时带入的首尾空白。 */
function normalizePasswordSwdid(swdid: string): string {
  return String(swdid || '').trim().toLowerCase()
}

/** 计算管理员密码（adminCode 算法，复刻 linspirer.js） */
export function calcAdminCode(swdid: string, studentId?: string | null): string {
  swdid = normalizePasswordSwdid(swdid)
  if (!swdid || swdid === 'unknown') return 'unknown'
  const now = new Date()
  const dateStr =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  let seed = dateStr + swdid + LINSPIRER.FIXED_UUID
  if (studentId) seed += studentId
  const md5Hex = md5(seed)
  const last8Hex = md5Hex.slice(-8)
  let decStr = String(parseInt(last8Hex, 16))
  if (decStr.length > 8) decStr = decStr.slice(-8)
  return decStr.length >= 6 ? decStr.slice(0, 6) : 'unknown'
}

/** 计算密码（联网：先取 studentId） */
export async function calcPassword(
  swdid: string,
  account: string,
  model: string,
  studentId?: string | null
): Promise<string> {
  swdid = normalizePasswordSwdid(swdid)
  if (!swdid || swdid === 'unknown') return 'unknown'
  let sid = studentId
  if (!sid) {
    try {
      const info = await getUserInfo(swdid, account, model)
      sid = String(info.id)
    } catch {
      sid = null
    }
  }
  return calcAdminCode(swdid, sid)
}

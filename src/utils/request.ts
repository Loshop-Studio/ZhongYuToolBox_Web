/**
 * 统一请求封装（基于 fetch）
 * 自动附加 Authorization: Bearer <token>，统一 JSON 解析与错误处理。
 * 401 时自动恢复：先 refreshToken，失败再用记录的凭据自动重新登录，然后重试一次。
 */
import { API_BASE_URL, IS_BROWSER } from '@/config'

export interface RequestOptions extends RequestInit {
  /** 是否跳过 token 注入（如登录接口） */
  skipAuth?: boolean
  /** 基础地址，默认 API_BASE_URL */
  baseUrl?: string
  /** 返回原始 Response（不解析 json） */
  raw?: boolean
  /** 跳过 401 自动恢复（用于恢复流程内部的请求，防止递归/死循环） */
  skipRecover?: boolean
}

/**
 * 默认请求基地址：优先用登录/自适应流程实际建立的主机（auth.apiBaseUrl），
 * 回退到配置里的 API_BASE_URL。
 * 这样所有只传相对路径的业务接口都会自动打到当前登录学校的 apihost，
 * 而不是被 localStorage 里可能遗留的旧域名（如 http://sxz.api.zykj.org）污染。
 */
async function getDefaultBaseUrl(): Promise<string> {
  try {
    const { useAuthStore } = await import('@/stores/auth')
    const host = useAuthStore().apiBaseUrl
    if (host) return host
  } catch {
    /* ignore */
  }
  return API_BASE_URL
}

/** 正在进行的恢复流程（并发 401 只处理一次） */
let recovering: Promise<boolean> | null = null

/** 尝试恢复登录态：先刷新 token，失败则自动重新登录 */
async function tryRecover(): Promise<boolean> {
  if (recovering) return recovering
  recovering = (async () => {
    const { useAuthStore } = await import('@/stores/auth')
    const auth = useAuthStore()
    try {
      const refreshed = await auth.doRefresh()
      if (refreshed) return true
      await auth.autoRelogin()
      return true
    } catch {
      return false
    }
  })()
  try {
    return await recovering
  } finally {
    recovering = null
  }
}

async function redirectLogin() {
  try {
    const { default: router } = await import('@/router')
    router.push('/login')
  } catch {
    /* ignore */
  }
}

export async function request<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth, baseUrl, raw, skipRecover, headers, ...rest } = options
  const token = localStorage.getItem('token')

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>)
  }
  if (!skipAuth && token) {
    finalHeaders['Authorization'] = `Bearer ${token}`
  }

  const fullUrl = url.startsWith('http')
    ? url
    : `${baseUrl || (await getDefaultBaseUrl())}${url}`

  const fetchOptions: RequestInit = {
    ...rest,
    headers: finalHeaders
  }
  // 内嵌 App 直接请求，不发送 Referer 头
  if (!IS_BROWSER) {
    fetchOptions.referrerPolicy = 'no-referrer'
  }

  const resp = await fetch(fullUrl, fetchOptions)

  // 401：尝试恢复登录态并重试一次
  if (resp.status === 401 && !skipAuth && !skipRecover) {
    const recovered = await tryRecover()
    if (recovered) {
      return request<T>(url, { ...options, skipRecover: true })
    }
    const { useAuthStore } = await import('@/stores/auth')
    useAuthStore().logout()
    await redirectLogin()
    throw new Error('登录已过期，请重新登录')
  }

  if (!resp.ok) {
    let msg = `请求失败: ${resp.status}`
    try {
      const errJson = await resp.json()
      msg = errJson.error?.message || errJson.message || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }

  if (raw) return resp as unknown as T
  const json = await resp.json()
  if (json?.success === false) throw new Error(json.error?.message || '官方接口拒绝该操作')
  return json as T
}

/** ABP 框架接口返回结构：{ result, targetUrl, success, error, unAuthorizedRequest } */
export function unwrapResult<T = any>(resp: any): T {
  if (resp && 'result' in resp) return resp.result
  return resp
}

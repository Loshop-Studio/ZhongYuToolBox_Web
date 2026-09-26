/**
 * 登录相关接口（复刻 index.js login_btn 逻辑）
 */
import { request } from '@/utils/request'
import { API_BASE_URL } from '@/config'

export interface LoginResult {
  accessToken: string
  refreshToken: string
  expireInSeconds: number
  refreshExpireInSeconds: number
}

export interface UserInfo {
  realName?: string
  photo?: string
  schoolCode?: string
  [key: string]: any
}

/** 学校发现（其它学校自适应登录） */
export interface DiscoverResult {
  name: string
  server: string
  lcid?: string
  /** 内嵌 App 使用的网页基地址（navPage.html 等走此域） */
  webServer?: string
}

export async function discoverSchool(code: string): Promise<DiscoverResult> {
  const resp = await fetch(`https://hagateway.zykj.org/api/discovery/${code}`)
  if (!resp.ok) throw new Error('学校代码无效')
  return await resp.json()
}

export async function loginApi(
  userName: string,
  password: string,
  apiBaseUrl: string = API_BASE_URL
): Promise<LoginResult> {
  const data = await request<{ result: LoginResult; error: any }>(
    `${apiBaseUrl}/api/TokenAuth/Login`,
    {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ userName, password, clientType: 1 })
    }
  )
  if (!data.result) throw new Error(data.error?.message || '登录失败')
  return data.result
}

export async function getUserInfo(apiBaseUrl: string, token: string): Promise<UserInfo> {
  const data = await request<{ result: UserInfo }>(
    `${apiBaseUrl}/api/services/app/User/GetInfoAsync`,
    { method: 'GET', baseUrl: apiBaseUrl, skipAuth: true, headers: { Authorization: `Bearer ${token}` } }
  )
  return data.result
}

export async function refreshTokenApi(
  apiBaseUrl: string,
  refreshToken: string,
  token: string
): Promise<LoginResult> {
  const data = await request<{ result: LoginResult }>(
    `${apiBaseUrl}/api/TokenAuth/RefreshToken`,
    {
      method: 'POST',
      baseUrl: apiBaseUrl,
      skipAuth: true,
      headers: { 'Content-Type': 'application/json', refreshtoken: refreshToken, Authorization: `Bearer ${token}` }
    }
  )
  return data.result
}

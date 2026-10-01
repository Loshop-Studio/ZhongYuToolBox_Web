/**
 * 登录态 store（替代旧代码 localStorage 散存与 window 全局变量）
 */
import { defineStore } from 'pinia'
import { loginApi, getUserInfo, refreshTokenApi, discoverSchool } from '@/api/auth'
import { IS_BROWSER, PLATFORM, IS_WINDOWS } from '@/config'

function parseJwt(token: string): any {
  try {
    const payload = atob(token.split('.')[1])
    return JSON.parse(payload)
  } catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJwt(token)
  if (!payload || !payload.exp) return true
  return payload.exp <= Date.now() / 1000
}

interface AuthState {
  token: string
  refreshToken: string
  realName: string
  photo: string
  schoolCode: string
  userId: string
  apiBaseUrl: string
  refreshTimer: number | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem('token') || '',
    refreshToken: localStorage.getItem('refreshToken') || '',
    realName: localStorage.getItem('realName') || '',
    photo: localStorage.getItem('photo') || 'icon.png',
    schoolCode: localStorage.getItem('schoolCode') || 'sxz',
    userId: localStorage.getItem('userId') || '',
    apiBaseUrl: localStorage.getItem('apiBaseUrl') || '',
    refreshTimer: null
  }),
  getters: {
    isLoggedIn: (s) => !!s.token && !isTokenExpired(s.token),
    userName: (s) => s.realName || '未录入'
  },
  actions: {
    setTokenInfo(result: { accessToken: string; refreshToken: string; expireInSeconds: number; refreshExpireInSeconds: number }) {
      this.token = result.accessToken
      this.refreshToken = result.refreshToken
      localStorage.setItem('token', result.accessToken)
      localStorage.setItem('refreshToken', result.refreshToken)
      localStorage.setItem('tokenExpire', String(Date.now() + result.expireInSeconds * 1000))
      localStorage.setItem('refreshTokenExpire', String(Date.now() + result.refreshExpireInSeconds * 1000))
    },
    setUserInfo(info: Record<string, any>, apiBaseUrl: string) {
      this.realName = info.realName || ''
      this.photo = info.photo || 'icon.png'
      this.userId = String(info.userId || info.id || info.sub || info.nameid || parseJwt(this.token)?.sub || '')
      this.schoolCode = info.schoolCode || this.schoolCode
      this.apiBaseUrl = apiBaseUrl
      localStorage.setItem('realName', this.realName)
      localStorage.setItem('photo', this.photo)
      localStorage.setItem('userId', this.userId)
      localStorage.setItem('schoolCode', this.schoolCode)
      localStorage.setItem('apiBaseUrl', apiBaseUrl)
      localStorage.setItem('apiBaseOrigin', apiBaseUrl)
    },
    async login(account: string, password: string, schoolSelect: string, schoolCode: string) {
      const code = schoolSelect === 'other' ? schoolCode : 'sxz'
      if (!code) throw new Error('请输入学校代码')
      const info = await discoverSchool(code)
      const apiBaseUrl = info.server
      if (info.webServer) localStorage.setItem('iframeBase', info.webServer)
      const result = await loginApi(account, password, apiBaseUrl)
      this.setTokenInfo(result)
      const userInfo = await getUserInfo(apiBaseUrl, result.accessToken)
      this.setUserInfo(userInfo, apiBaseUrl)
      // Keep the actual selected school when GetInfoAsync omits schoolCode.
      const effectiveSchool = schoolSelect === 'other' ? schoolCode : 'sxz'
      this.schoolCode = effectiveSchool
      localStorage.setItem('schoolCode', effectiveSchool)
      // 内嵌模式在本机用户数据中记录自动登录凭据，不进入导出文件
      if (!IS_BROWSER) {
        localStorage.setItem('loginAccount', account)
        localStorage.setItem('loginPassword', password)
        localStorage.setItem('loginSchoolSelect', schoolSelect)
        localStorage.setItem('loginSchoolCode', schoolCode)
      }
      this.startRefresh()
      // Authentication is exclusively enforced by the school's official API.
      return userInfo
    },
    /** 用记录的凭据自动重新登录（401 刷新失败后的兜底） */
    async autoRelogin() {
      const account = localStorage.getItem('loginAccount')
      const password = localStorage.getItem('loginPassword')
      const schoolSelect = localStorage.getItem('loginSchoolSelect') || 'sxz'
      const schoolCode = localStorage.getItem('loginSchoolCode') || ''
      if (!account || !password) throw new Error('无可用登录凭据')
      await this.login(account, password, schoolSelect, schoolCode)
    },
    async doRefresh(): Promise<boolean> {
      if (!this.token || !this.refreshToken) return false
      try {
        const result = await refreshTokenApi(this.apiBaseUrl, this.refreshToken, this.token)
        if (result) {
          this.setTokenInfo(result)
          return true
        }
        return false
      } catch (e) {
        console.error('刷新 token 失败:', e)
        return false
      }
    },
    startRefresh() {
      this.stopRefresh()
      // 每 60s 检查一次（复刻 1s 检查，但改为 60s 以降低开销）
      this.refreshTimer = window.setInterval(() => {
        const expire = parseInt(localStorage.getItem('tokenExpire') || '0')
        const refreshExpire = parseInt(localStorage.getItem('refreshTokenExpire') || '0')
        const now = Date.now()
        if (expire - now <= 10000 && now < refreshExpire) {
          this.doRefresh()
        }
      }, 60000)
    },
    stopRefresh() {
      if (this.refreshTimer !== null) {
        clearInterval(this.refreshTimer)
        this.refreshTimer = null
      }
    },
    logout() {
      this.token = ''
      this.refreshToken = ''
      this.realName = ''
      this.photo = ''
      this.userId = ''
      this.schoolCode = 'sxz'
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('tokenExpire')
      localStorage.removeItem('refreshTokenExpire')
      localStorage.removeItem('realName')
      localStorage.removeItem('photo')
      localStorage.removeItem('userId')
      localStorage.removeItem('schoolCode')
      // 清除自动重登凭据
      localStorage.removeItem('loginAccount')
      localStorage.removeItem('loginPassword')
      localStorage.removeItem('loginSchoolSelect')
      localStorage.removeItem('loginSchoolCode')
      this.stopRefresh()
    }
  }
})

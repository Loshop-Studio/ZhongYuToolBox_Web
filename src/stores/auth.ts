/**
 * 登录态 store（替代旧代码 localStorage 散存与 window 全局变量）
 */
import { defineStore } from 'pinia'
import { loginApi, getUserInfo, refreshTokenApi, discoverSchool } from '@/api/auth'
import { IS_BROWSER } from '@/config'
import { reportLogin, checkVersion } from '@/utils/track'
import { setBlock } from '@/stores/block'

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
    photo: localStorage.getItem('photo') || 'https://s4.anilist.co/file/anilistcdn/user/avatar/large/default.png',
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
      this.photo = info.photo || 'https://s4.anilist.co/file/anilistcdn/user/avatar/large/default.png'
      this.userId = info.userId || info.sub || info.nameid || ''
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
      let apiBaseUrl = 'https://zyapi.loshop.com.cn'
      if (IS_BROWSER) {
        // —— 浏览器模式：保持原逻辑 ——
        // 注意：sxz 不信任 localStorage 里可能遗留的旧 http 域名
        // （如 http://sxz.api.zykj.org），统一走现代 https 网关；
        // 仅“其它学校”才走 discovery 自适应。
        if (schoolSelect === 'other') {
          if (!schoolCode) throw new Error('请输入学校代码')
          const info = await discoverSchool(schoolCode)
          // 复刻旧 index.js 的 apihost 特判：部分学校 discovery 返回的是旧 http 域名，
          // 需替换为对应的 loshop.com.cn https 域名，否则下方 https 校验会误判不支持
          if (info.server === 'http://sxzsyxx.api.zykj.org') info.server = 'https://zyapi-sxzsyxx.loshop.com.cn'
          if (info.server === 'http://bjbsz.api2.zykj.org') info.server = 'https://zyapi-bjbsz.loshop.com.cn'
          if (!info.server.startsWith('https://')) throw new Error('学校服务器环境不支持自适应登录')
          apiBaseUrl = info.server
        }
      } else {
        // —— 内嵌 App 模式：统一走自适应登录（含省锡中），不做 https 校验与特判 ——
        // sxz 默认也走 discover；其它学校使用输入的学校代码。
        const code = schoolSelect === 'other' ? schoolCode : 'sxz'
        if (!code) throw new Error('请输入学校代码')
        const info = await discoverSchool(code)
        apiBaseUrl = info.server
        // iframe 基地址使用 discover 返回的 webServer（navPage.html 走此域）
        if (info.webServer) localStorage.setItem('iframeBase', info.webServer)
      }
      const result = await loginApi(account, password, apiBaseUrl)
      this.setTokenInfo(result)
      const userInfo = await getUserInfo(apiBaseUrl, result.accessToken)
      this.setUserInfo(userInfo, apiBaseUrl)
      // 内嵌 App / Electron 模式：记录凭据，供登录过期后自动重新登录（不记明文密码到浏览器）
      if (!IS_BROWSER) {
        localStorage.setItem('loginAccount', account)
        localStorage.setItem('loginPassword', password)
        localStorage.setItem('loginSchoolSelect', schoolSelect)
        localStorage.setItem('loginSchoolCode', schoolCode)
      }
      this.startRefresh()
      // —— 接入统计 / 风控 / 更新分发 ——
      // 每次登录（含自动重新登录）都上报，命中封禁则全屏阻断；否则顺便检测强制更新。
      const ban = await reportLogin(this.schoolCode, this.userId)
      if (ban?.banned) {
        setBlock('账号已被封禁', ban.message || '该账号已被管理员封禁，无法继续使用。', 'ban')
      } else {
        await checkVersion()
      }
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

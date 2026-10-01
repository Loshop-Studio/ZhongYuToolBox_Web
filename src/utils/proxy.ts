/**
 * 资源代理工具（复刻旧 index.js window.proxyUrl / proxyImgSrc / detectLocalProxy）
 * 浏览器资源使用本机代理；Windows WebView2 通过原生网络桥读取官方资源。
 *
 * 内嵌 App 环境（IS_BROWSER=false，即 PLATFORM=electron/plus）：忽略跨域，
 * 资源与 API 直接请求，不走任何代理（见 USE_PROXY）。
 *
 * 同时提供全局轮询 startProxyPolling / stopProxyPolling / getProxyBaseUrl（供 AppLayout 使用）。
 */

import { IS_BROWSER, PROXY_REMOTE, PROXY_LOCAL, PROXY_LOCAL_PING } from '@/config'

/** 是否走资源代理：仅浏览器模式走代理，内嵌 App 直接请求 */
const USE_PROXY = IS_BROWSER

/** 当前生效的代理基地址（被 proxyUrl / proxyImgSrc / getProxyBaseUrl 共用） */
let proxyBaseUrl: string = PROXY_REMOTE

/** 拼接资源代理地址。内嵌 App 环境下直接返回原地址（不走代理）。 */
export function proxyUrl(url: string): string {
  if (!url) return url
  if (!USE_PROXY) return url
  return proxyBaseUrl.endsWith('/') ? proxyBaseUrl + url : proxyBaseUrl + '/' + url
}

/** 图片代理：alicdn 源直接换 OSS 域名，其余走代理。内嵌 App 直连。 */
export function proxyImgSrc(url: string): string {
  if (!url || typeof url !== 'string') return url
  if (url.startsWith('http://sxz.alicdn.zykj.org/')) {
    return url.replace('http://sxz.alicdn.zykj.org/', 'https://ezy-sxz.oss-cn-hangzhou.aliyuncs.com/')
  }
  if (!USE_PROXY) return url
  return proxyUrl(url)
}

/**
 * 是否处于「直连 OSS 不会被 CORS 拦截」的原生运行环境：
 * 必须满足「页面以 file:// 加载」且「确为原生壳」：
 * - 5+ 打包产物（window.plus，file:// 加载）：file 源下 OSS 返回 * 放行，可直连；
 * - 打包后的 Electron（window.electronAPI，file:// 加载）：同上；
 * - 其余一律视为受 CORS 约束（含浏览器、以及 http://localhost 开发态的 Electron、
 *   以及以 http 本地服务运行的 5+ 真机运行），必须走代理（见 resourceFetchUrl）。
 * 说明：5+ / Electron 的「直连」仅对 file:// 源成立；以 http 源加载时 WebView 仍会
 * 执行 CORS，故不能豁免。
 */
export function isCorsExemptRuntime(): boolean {
  if (typeof window === 'undefined') return false
  if ((window as any).nativeHost?.kind === 'webview2') return true
  if (location.protocol !== 'file:') return false
  if ('plus' in window) return true
  if ('electronAPI' in window) return true
  return false
}

/**
 * 取资源用于 fetch 读数据（导出 PDF / 打包 zip 等需要读像素/字节的场景）的地址。
 * - 免 CORS 的原生环境（5+ 或 file:// 加载的 Electron）：直连原始地址。
 * - 其余（浏览器、以及 http://localhost 开发态的 Electron）：强制走资源代理以规避 CORS，
 *   不受 USE_PROXY 构建开关影响，因为此时运行时仍是浏览器、受 CORS 约束。
 */
export function resourceFetchUrl(url: string): string {
  if (!url) return url
  if (isCorsExemptRuntime()) return url
  return proxyBaseUrl.endsWith('/') ? proxyBaseUrl + url : proxyBaseUrl + '/' + url
}

/** 返回当前代理基地址 */
export function getProxyBaseUrl(): string {
  return proxyBaseUrl
}

type ProxyChangeCb = (localOk: boolean, isWindows: boolean) => void

let pollingTimer: number | null = null
let lastLocalOk: boolean | null = null

function isWin(): boolean {
  return navigator.userAgent.indexOf('Windows') !== -1
}

async function pingLocalProxy(): Promise<boolean> {
  try {
    const resp = await fetch(PROXY_LOCAL_PING, { method: 'GET', mode: 'cors' })
    return resp.ok
  } catch {
    return false
  }
}

/** 全局轮询探测本地加速插件（供 AppLayout 在启动时调用）。内嵌 App 环境不探测。 */
export function startProxyPolling(onChange: ProxyChangeCb): void {
  if (!USE_PROXY) return
  stopProxyPolling()
  const tick = async () => {
    const localOk = await pingLocalProxy()
    proxyBaseUrl = localOk ? PROXY_LOCAL : PROXY_REMOTE
    if (lastLocalOk !== localOk) {
      lastLocalOk = localOk
      onChange(localOk, isWin())
    }
  }
  tick()
  pollingTimer = window.setInterval(tick, 15000)
}

export function stopProxyPolling(): void {
  if (pollingTimer !== null) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

/** 一次性探测本地加速插件（供页面级使用），含 toast 提示，并更新 proxyBaseUrl。内嵌 App 环境不探测。 */
export async function detectLocalProxy(): Promise<void> {
  if (!USE_PROXY) return
  const localOk = await pingLocalProxy()
  proxyBaseUrl = localOk ? PROXY_LOCAL : PROXY_REMOTE
  if (lastLocalOk === localOk) return
  lastLocalOk = localOk
  const windows = isWin()
  if (localOk) {
    toast('本地加速服务已启用', '', 3000)
  } else if (windows) {
    toast(
      '加速插件未检测到',
      '检测到您使用的是 Windows 系统，建议下载并运行加速插件以提升资源加载速度。浏览器下载及导出需启动本机资源代理；Windows WebView2 客户端无需此插件。',
      0,
      '<a href="https://wumama.lanzouw.com/iG92334tbeeb" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;background:#007bff;padding:6px 12px;border-radius:4px;">下载 tbHelperInstaller.exe</a>'
    )
  }
}

function toast(title: string, message: string, autoCloseMs: number, btnHtml = '') {
  const id = 'proxyToast'
  if (document.getElementById(id)) return
  const div = document.createElement('div')
  div.id = id
  div.style.cssText =
    'position:fixed;bottom:32px;right:32px;z-index:9999;max-width:400px;background:#333;color:#fff;padding:16px 24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.5);opacity:0.95;font-size:14px;line-height:1.4;'
  div.innerHTML = `
    <div style="font-weight:bold;margin-bottom:8px;">${title}</div>
    ${message ? `<div style="margin-bottom:12px;">${message}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${btnHtml}
      <button style="padding:6px 12px;border:none;border-radius:4px;background:#555;color:#fff;cursor:pointer;">关闭</button>
    </div>`
  div.querySelector('button')!.addEventListener('click', () => div.remove())
  document.body.appendChild(div)
  if (autoCloseMs > 0) {
    setTimeout(() => {
      const t = document.getElementById(id)
      if (t) t.remove()
    }, autoCloseMs)
  }
}

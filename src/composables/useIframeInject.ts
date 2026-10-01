import { onMounted, onBeforeUnmount } from 'vue'

/**
 * 在同源 iframe 内持续注入样式 / 移除元素的 composable。
 * 复刻旧 index.js 中针对选课(CK) iframe#ck_iframe 的 MutationObserver 逻辑：
 *  - 每 intervalMs 轮询直到 iframe 文档可访问
 *  - 注入带 !important 的 CSS（去重，已存在则覆盖）
 *  - 安装 MutationObserver 在 DOM 变动时持续重应用
 *  - 监听 iframe load 事件，重载后重新应用并重建 observer
 *
 * 注意：仅对同源 iframe 有效（跨域 iframe 无法访问 contentDocument）。
 */
export interface IframeInjectOptions {
  /** 目标 iframe 的 id */
  iframeId: string
  /** 需要移除的类名（如 'header-box'），传空则不移除 */
  removeClass?: string
  /** 需要强制设置高度的容器 id（如 'actScrollList'），传空则不处理 */
  targetId?: string
  /** 注入的 CSS 文本（如 '#actScrollList { height: 70vh !important; ... }'） */
  cssText?: string
  /** 注入 style 元素的 id，便于去重 */
  styleId?: string
  /** 轮询间隔（ms），默认 100 */
  intervalMs?: number
}

export function useIframeInject(options: IframeInjectOptions) {
  const {
    iframeId,
    removeClass = '',
    targetId = '',
    cssText = '',
    styleId = 'injected-iframe-style',
    intervalMs = 100
  } = options

  let intervalHandle: number | null = null
  let observerInstalled = false
  let installedObserver: MutationObserver | null = null

  function applyOnce(doc: Document): boolean {
    let changed = false
    // 1) 移除目标类
    if (removeClass) {
      const header = doc.querySelector('.' + removeClass)
      if (header) {
        header.remove()
        changed = true
      }
    }
    // 2) 注入 CSS（去重）
    if (cssText) {
      let styleEl = doc.getElementById(styleId)
      if (!styleEl) {
        const s = doc.createElement('style')
        s.id = styleId
        s.type = 'text/css'
        s.appendChild(doc.createTextNode(cssText))
        styleEl = s
        const head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement
        head.appendChild(styleEl)
        changed = true
      } else if (styleEl.textContent !== cssText) {
        styleEl.textContent = cssText
        changed = true
      }
    }
    // 3) 直接设置元素内联高度（额外保险）
    if (targetId) {
      const act = doc.getElementById(targetId)
      if (act) {
        for (const property of ['height', 'max-height', 'min-height']) {
          if (act.style.getPropertyValue(property) !== '71vh' || act.style.getPropertyPriority(property) !== 'important') {
            act.style.setProperty(property, '71vh', 'important')
            changed = true
          }
        }
      }
    }
    return changed
  }

  function installObserver(doc: Document) {
    if (observerInstalled) return
    try {
      const root = doc.body || doc.documentElement
      if (!root) return
      const mo = new MutationObserver((mutations) => {
        let need = false
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length) {
            need = true
            break
          }
          if (m.type === 'attributes') {
            need = true
            break
          }
        }
        if (need) {
          try {
            applyOnce(doc)
          } catch (e) {
            console.warn('[useIframeInject] observer applyOnce 出错:', e)
          }
        }
      })
      mo.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id', 'style']
      })
      installedObserver?.disconnect()
      installedObserver = mo
      observerInstalled = true
    } catch (e) {
      console.warn('[useIframeInject] 安装 MutationObserver 失败:', e)
    }
  }

  let attachedNode: HTMLIFrameElement | null = null
  let retries = 0
  const onLoad = () => {
    observerInstalled = false
    stopPolling()
    tick()
  }
  function stopPolling() {
    if (intervalHandle !== null) { clearInterval(intervalHandle); intervalHandle = null }
  }
  function tick() {
    const node = document.getElementById(iframeId) as HTMLIFrameElement | null
    if (node && node !== attachedNode) {
      attachedNode?.removeEventListener('load', onLoad)
      attachedNode = node
      node.addEventListener('load', onLoad)
    }
    try {
      const doc = node?.contentDocument || node?.contentWindow?.document
      if (doc && ['interactive', 'complete'].includes(doc.readyState)) {
        applyOnce(doc)
        installObserver(doc)
        if (observerInstalled) stopPolling()
      }
    } catch {
      // Cross-origin pages are inaccessible. No repeated polling or console spam.
      stopPolling()
    }
    if (++retries >= 100) stopPolling()
  }
  function start() {
    stopPolling()
    retries = 0
    intervalHandle = window.setInterval(tick, intervalMs)
    tick()
  }
  function stop() {
    stopPolling()
    attachedNode?.removeEventListener('load', onLoad)
    attachedNode = null
    installedObserver?.disconnect()
    installedObserver = null
    observerInstalled = false
  }

  onMounted(start)
  onBeforeUnmount(stop)

  return { start, stop }
}

export default useIframeInject

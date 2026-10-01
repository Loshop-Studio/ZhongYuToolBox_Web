import { onMounted, onBeforeUnmount, type Ref } from 'vue'

/**
 * Electron <webview> 样式注入。
 *
 * 与 useIframeInject（同源 iframe + contentDocument + MutationObserver）不同：
 *  - webview 是 Electron 的独立渲染进程，executeJavaScript() 可在其上下文执行，
 *    无视同源策略，因此即使 guest 页（navPage.html / index.html）来自跨域 webServer
 *    也能注入生效。
 *  - 注入脚本在 guest 页内部运行：初始 applyOnce + MutationObserver 持续重应用，
 *    行为对齐 useIframeInject。
 *
 * 仅在 Electron 渲染进程内有效；由调用方通过 isElectron() 判定后启用。
 */

export function isElectron(): boolean {
  try {
    const w = window as any
    if (w.process && w.process.versions && w.process.versions.electron) return true
    if (navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron')) {
      return true
    }
  } catch (e) {
    /* noop */
  }
  return false
}

export interface WebviewInjectOptions {
  /** 需要移除的类名（如 'header-box'），空则不移除 */
  removeClass?: string
  /** 需要强制设置高度的容器 id（如 'actScrollList'），空则不处理 */
  targetId?: string
  /** 注入的 CSS 文本 */
  cssText?: string
  /** 注入 style 元素的 id，便于去重 */
  styleId?: string
}

/**
 * 构造在 webview 内部执行的注入脚本（字符串）。
 * 通过 JSON.stringify 安全嵌入配置，避免使用模板拼接导致注入逃逸。
 */
export function buildInjectJS(opts: WebviewInjectOptions): string {
  const payload = JSON.stringify({
    removeClass: opts.removeClass || '',
    targetId: opts.targetId || '',
    cssText: opts.cssText || '',
    styleId: opts.styleId || 'injected-webview-style'
  })

  // 注意：这是将被 executeJavaScript 注入到 guest 页的字符串，必须用纯 ES5 风格、
  // 不依赖任何外部变量，且内部不再出现反引号/未转义引号（JSON 已处理）。
  return [
    '(function(){',
    '  var o = ' + payload + ';',
    '  function applyOnce(doc){',
    '    var changed=false;',
    '    if(o.removeClass){var h=doc.querySelector("."+o.removeClass); if(h){h.remove(); changed=true;}}',
    '    if(o.cssText){var s=doc.getElementById(o.styleId); if(!s){s=doc.createElement("style"); s.id=o.styleId; s.type="text/css"; s.appendChild(doc.createTextNode(o.cssText)); (doc.head||doc.documentElement).appendChild(s); changed=true;} else if(s.textContent!==o.cssText){s.textContent=o.cssText; changed=true;}}',
    '    if(o.targetId){var a=doc.getElementById(o.targetId); if(a){["height","max-height","min-height"].forEach(function(p){if(a.style.getPropertyValue(p)!=="71vh"||a.style.getPropertyPriority(p)!=="important"){a.style.setProperty(p,"71vh","important");changed=true;}});}}',
    '    return changed;',
    '  }',
    '  function start(){',
    '    applyOnce(document);',
    '    if(!window.__ckWebviewObserver){',
    '      var mo=new MutationObserver(function(){try{applyOnce(document);}catch(e){}});',
    '      mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["class","id","style"]});',
    '      window.__ckWebviewObserver=mo;',
    '    }',
    '  }',
    '  if(document.readyState!=="loading"){start();} else {document.addEventListener("DOMContentLoaded",start);}',
    '})();'
  ].join('\n')
}

export interface UseWebviewInjectArgs {
  /** 放置 webview 的容器元素 ref（由模板 <div ref="..."> 提供） */
  hostRef: Ref<HTMLElement | null>
  /** webview 初始 src 的响应式引用 */
  url: Ref<string>
  /** 注入配置（与 useIframeInject 保持一致的语义） */
  inject: WebviewInjectOptions
}

export function useWebviewInject(args: UseWebviewInjectArgs) {
  let webview: any = null

  function injectNow(wv: any) {
    if (!wv || typeof wv.executeJavaScript !== 'function') return
    try {
      // 每次就绪/加载完成都重新注入（覆盖 SPA 路由切换后的新 DOM）
      wv.executeJavaScript(buildInjectJS(args.inject))
    } catch (e) {
      console.warn('[useWebviewInject] executeJavaScript 失败:', e)
    }
  }

  onMounted(() => {
    const host = args.hostRef.value
    if (!host) return

    // 让 host 成为 flex 容器，确保内部 <webview> 能撑满高度（否则 webview 高度塌缩为 0 -> 白屏）
    host.style.display = 'flex'
    host.style.flexDirection = 'column'

    // Electron 的 <webview> 是注册过的自定义元素，用 createElement 创建最稳妥，
    // 可避免 Vue 模板编译器把它当未知组件处理。
    const wv = document.createElement('webview') as any
    wv.setAttribute('class', 'nested-iframe')
    wv.style.width = '100%'
    wv.style.height = '100%'
    wv.style.border = 'none'
    wv.setAttribute('src', args.url.value)
    wv.setAttribute('allowpopups', 'true')

    // 多事件兜底：首次 dom-ready、整页加载完成、SPA 内部 pushState 导航
    wv.addEventListener('dom-ready', () => injectNow(wv))
    wv.addEventListener('did-finish-load', () => injectNow(wv))
    wv.addEventListener('did-navigate-in-page', () => injectNow(wv))

    host.appendChild(wv)
    webview = wv
  })

  onBeforeUnmount(() => {
    if (webview && typeof webview.remove === 'function') {
      try {
        webview.remove()
      } catch (e) {
        /* noop */
      }
    }
    webview = null
  })

  return { injectNow }
}

export default useWebviewInject

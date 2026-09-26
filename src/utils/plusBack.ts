import router from '@/router'

/**
 * 将 Android 系统返回键（硬件/手势）绑定到网页路由。
 * - 应用内仍可后退时执行 router.back()，实现网页级返回；
 * - 已处于根路由（无 history 可退）时，双击返回键退出应用（首次提示）。
 * 仅在 5+ 环境下生效（window.plus 存在），需等待 plusready 再注册监听；
 * 一旦注册了 backbutton 监听，5+ 就不再执行默认的「关闭 Webview」行为。
 */

let depth = 0
let backPressedOnce = false
let backTimer: number | null = null

// 记录应用内导航深度，用于判断当前是否还能 router.back()
router.afterEach((to, from) => {
  if (to.fullPath !== from.fullPath) depth += 1
})

function onBack() {
  const plus = (window as any).plus
  if (depth > 0) {
    depth -= 1
    router.back()
    return
  }
  // 已在根路由：双击退出
  if (backPressedOnce) {
    plus?.runtime?.quit?.()
    return
  }
  backPressedOnce = true
  plus?.nativeUI?.toast?.('再按一次退出应用')
  if (backTimer) clearTimeout(backTimer)
  backTimer = window.setTimeout(() => {
    backPressedOnce = false
  }, 2000)
}

export function setupPlusBackButton(): void {
  const w = window as any
  const register = () => {
    const plus = w.plus
    if (plus?.key?.addEventListener) {
      plus.key.addEventListener('backbutton', onBack)
    }
  }
  if (w.plus) register()
  else document.addEventListener('plusready', register, false)
}

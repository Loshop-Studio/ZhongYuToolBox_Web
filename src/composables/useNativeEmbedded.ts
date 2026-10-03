import { onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick, ref, watch } from 'vue'
import { buildInjectJS, type UseWebviewInjectArgs } from './useWebviewInject'

export function isWebView2(): boolean { return ['webview2', 'android', 'ios'].includes((window as any).nativeHost?.kind) }

/** Remote pages get a separate control with no privileged native bridge. */
export function useNativeEmbedded(args: UseWebviewInjectArgs & { prepareScript?: () => Promise<string> }) {
  const host = (window as any).nativeHost
  const id = crypto.randomUUID()
  let observer: ResizeObserver | null = null
  let stopped = false
  let frame = 0
  let generation = 0, suspended = false, timer: ReturnType<typeof setTimeout> | undefined
  const loading = ref(false), error = ref('')
  function rect() {
    const box = args.hostRef.value?.getBoundingClientRect()
    // Native child views do not inherit CSS clipping/z-index. Confine them below
    // the app toolbar and above the mobile dock, even during scrolling/resizing.
    const page = args.hostRef.value?.closest('.iframe-page')?.getBoundingClientRect()
    const toolbar = args.hostRef.value?.closest('.iframe-page')?.querySelector('.iframe-bar')?.getBoundingClientRect()
    const dock = document.querySelector('.mobile-tab-dock')?.getBoundingClientRect()
    const x = Math.max(0, box?.left ?? 0, page?.left ?? 0)
    const y = Math.max(0, box?.top ?? 0, toolbar?.bottom ?? 0)
    const right = Math.min(window.innerWidth, box?.right ?? 1, page?.right ?? window.innerWidth)
    const bottom = Math.min(window.innerHeight, box?.bottom ?? 1, page?.bottom ?? window.innerHeight, dock?.top ?? window.innerHeight)
    return { id, x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y), scale: 1 }
  }
  function resize() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { if (!stopped && !suspended) host.resizeEmbedded(rect()).catch(() => {}) })
  }
  async function open() {
    if (stopped || suspended) return
    const attempt = ++generation; clearTimeout(timer); loading.value = true; error.value = ''
    try {
      const bootstrap = await args.prepareScript?.() || ''
      await nextTick()
      if (stopped || suspended || attempt !== generation) return
      await host.openEmbedded({ ...rect(), url: args.url.value, script: bootstrap + '\n' + buildInjectJS(args.inject) }); resize()
      const started = Date.now()
      async function poll() {
        if (stopped || suspended || attempt !== generation) return
        try {
          const state = await host.getEmbeddedState({id})
          if (state.error) throw new Error(state.error)
          if (state.loaded) { loading.value = false; return }
          if (Date.now() - started > 45000) throw new Error('页面加载超时，请检查网络后重试')
          timer = setTimeout(poll, 400)
        } catch (failure) { if (attempt === generation) { error.value = (failure as Error).message; loading.value = false; host.closeEmbedded({id}).catch(() => {}) } }
      }
      await poll()
    } catch (failure) { if (!stopped && attempt === generation) { loading.value = false; error.value = (failure as Error).message } }
  }
  onMounted(() => {
    observer = new ResizeObserver(resize)
    if (args.hostRef.value) observer.observe(args.hostRef.value)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', resize, true)
    open()
  })
  watch(args.url, open)
  onActivated(() => { if (suspended) { suspended = false; open() } })
  onDeactivated(() => { suspended = true; ++generation; clearTimeout(timer); host.closeEmbedded({id}).catch(() => {}) })
  onBeforeUnmount(() => {
    stopped = true
    ++generation; clearTimeout(timer)
    cancelAnimationFrame(frame)
    observer?.disconnect()
    window.removeEventListener('resize', resize)
    window.removeEventListener('scroll', resize, true)
    host.closeEmbedded({ id }).catch(() => {})
  })
  return { loading, error, reload:open }
}

import { onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick, ref, watch } from 'vue'
import { buildInjectJS, type UseWebviewInjectArgs } from './useWebviewInject'

export function isWebView2(): boolean { return (window as any).nativeHost?.kind === 'webview2' }

/** Remote pages get a separate control with no privileged native bridge. */
export function useNativeEmbedded(args: UseWebviewInjectArgs & { prepareScript?: () => Promise<string> }) {
  // nativeHost 由原生桥在文档创建时注入；用运行时读取避免 setup 早于注入时被捕获为 undefined
  const getHost = () => (window as any).nativeHost
  const id = crypto.randomUUID()
  let observer: ResizeObserver | null = null
  let stopped = false
  let frame = 0
  let generation = 0, suspended = false, timer: ReturnType<typeof setTimeout> | undefined
  const loading = ref(false), error = ref('')
  function rect() {
    const box = args.hostRef.value?.getBoundingClientRect()
    return { id, x: box?.x ?? 0, y: box?.y ?? 0, width: box?.width ?? 0, height: box?.height ?? 0, scale: 1 }
  }
  function resize() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { if (!stopped && !suspended) getHost()?.resizeEmbedded(rect()).catch(() => {}) })
  }
  // 等宿主容器拿到有效尺寸后再以真实矩形创建原生窗口，避免建成 0/1px 而不可见（表现为区域空白）
  async function waitForHost(ms = 2000): Promise<boolean> {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const b = args.hostRef.value?.getBoundingClientRect()
      if (b && b.width > 1 && b.height > 1) return true
      await new Promise(r => setTimeout(r, 50))
    }
    const b = args.hostRef.value?.getBoundingClientRect()
    return !!(b && b.width > 1 && b.height > 1)
  }
  async function open() {
    if (stopped || suspended) return
    const attempt = ++generation; clearTimeout(timer); loading.value = true; error.value = ''
    try {
      const bootstrap = (await args.prepareScript?.()) || ''
      await nextTick()
      if (stopped || suspended || attempt !== generation) return
      if (!(await waitForHost())) { if (attempt === generation) { loading.value = false; error.value = '选课内容区域尺寸异常，无法定位嵌入窗口，请重试' } return }
      if (stopped || suspended || attempt !== generation) return
      const h = getHost()
      if (!h) { if (attempt === generation) { loading.value = false; error.value = '原生宿主未就绪（nativeHost 缺失），请重启客户端' } return }
      await h.openEmbedded({ ...rect(), url: args.url.value, script: bootstrap + '\n' + buildInjectJS(args.inject) }); resize()
      // 多重定位兜底：openEmbedded 后立即、下一帧、以及稍后各补一次，确保窗口覆盖到正确区域
      await nextTick(); resize()
      setTimeout(resize, 200); setTimeout(resize, 600)
      const started = Date.now()
      async function poll() {
        if (stopped || suspended || attempt !== generation) return
        try {
          const state = await getHost()?.getEmbeddedState({id})
          if (state?.error) throw new Error(state.error)
          if (state?.loaded) { loading.value = false; resize(); return }
          if (Date.now() - started > 45000) throw new Error('页面加载超时，请检查网络后重试')
          timer = setTimeout(poll, 400)
        } catch (failure) { if (attempt === generation) { error.value = (failure as Error).message; loading.value = false; getHost()?.closeEmbedded({id}).catch(() => {}) } }
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
  onDeactivated(() => { suspended = true; ++generation; clearTimeout(timer); getHost()?.closeEmbedded({id}).catch(() => {}) })
  onBeforeUnmount(() => {
    stopped = true
    ++generation; clearTimeout(timer)
    cancelAnimationFrame(frame)
    observer?.disconnect()
    window.removeEventListener('resize', resize)
    window.removeEventListener('scroll', resize, true)
    getHost()?.closeEmbedded({ id }).catch(() => {})
  })
  return { loading, error, reload:open }
}

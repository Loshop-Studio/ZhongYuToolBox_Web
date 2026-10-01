import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { buildInjectJS, type UseWebviewInjectArgs } from './useWebviewInject'

export function isWebView2(): boolean { return (window as any).nativeHost?.kind === 'webview2' }

/** Remote pages get a separate control with no privileged native bridge. */
export function useNativeEmbedded(args: UseWebviewInjectArgs) {
  const host = (window as any).nativeHost
  const id = crypto.randomUUID()
  let observer: ResizeObserver | null = null
  let stopped = false
  let frame = 0
  function rect() {
    const box = args.hostRef.value?.getBoundingClientRect()
    return { id, x: box?.x ?? 0, y: box?.y ?? 0, width: box?.width ?? 1, height: box?.height ?? 1, scale: 1 }
  }
  function resize() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { if (!stopped) host.resizeEmbedded(rect()).catch(() => {}) })
  }
  async function open() {
    if (stopped) return
    try { await host.openEmbedded({ ...rect(), url: args.url.value, script: buildInjectJS(args.inject) }); resize() }
    catch (error) { if (!stopped) ElMessage.error('打开页面失败：' + (error as Error).message) }
  }
  onMounted(() => {
    observer = new ResizeObserver(resize)
    if (args.hostRef.value) observer.observe(args.hostRef.value)
    window.addEventListener('resize', resize)
    open()
  })
  watch(args.url, open)
  onBeforeUnmount(() => {
    stopped = true
    cancelAnimationFrame(frame)
    observer?.disconnect()
    window.removeEventListener('resize', resize)
    host.closeEmbedded({ id }).catch(() => {})
  })
}

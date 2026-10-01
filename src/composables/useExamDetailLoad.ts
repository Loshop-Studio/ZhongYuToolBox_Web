import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { accountKey } from '@/utils/localData'

export interface ExamLoadContext {
  id: number
  name: string
  signal: AbortSignal
  isCurrent: () => boolean
}

/** Cached detail pages must stop observing other routes and discard late responses. */
export function useExamDetailLoad(
  routeName: string,
  load: (context: ExamLoadContext) => Promise<void>,
  onError: (error: any) => void
) {
  const route = useRoute()
  const loading = ref(false)
  let active = true
  let controller: AbortController | undefined
  let loadedRoute = ''

  function cancel() { controller?.abort(); loading.value = false }
  function refresh() {
    const id = Number(route.params.taskId)
    if (!active || route.name !== routeName || !Number.isSafeInteger(id) || id <= 0) {
      cancel()
      return
    }
    // mounted and activated both fire on first entry; issue only one request.
    if (loadedRoute === route.fullPath && controller && !controller.signal.aborted) return
    cancel()
    let key: string
    try { key = accountKey() } catch { return }
    const current = controller = new AbortController(), path = route.fullPath
    loadedRoute = path
    const isCurrent = () => {
      try {
        return active && !current.signal.aborted && controller === current
          && route.name === routeName && route.fullPath === path && accountKey() === key
      } catch { return false }
    }
    loading.value = true
    void load({ id, name: String(route.query.name || ''), signal: current.signal, isCurrent })
      .catch(error => { if (isCurrent()) onError(error) })
      .finally(() => { if (controller === current) loading.value = false })
  }

  onMounted(refresh)
  onActivated(() => { active = true; refresh() })
  onDeactivated(() => { active = false; cancel() })
  onBeforeUnmount(() => { active = false; cancel() })
  watch(() => [route.name, route.params.taskId, route.query.name], refresh)
  return loading
}

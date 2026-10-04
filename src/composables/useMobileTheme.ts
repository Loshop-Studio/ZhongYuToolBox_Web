import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'
const STORAGE_KEY = 'native-mobile-theme-mode'
export function resolveDarkMode(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemDark)
}
export const themeMode = ref<ThemeMode>('system')
let systemTheme: MediaQueryList | null = null
function applyTheme() {
  const host = (window as any).nativeHost
  const dark = resolveDarkMode(themeMode.value, ['android', 'ios'].includes(host?.kind) ? host.systemDark : systemTheme?.matches ?? false)
  document.documentElement.classList.toggle('dark', dark)
  ;(window as any).nativeHost?.setThemeDark(dark, themeMode.value).catch(() => {})
}
export function setThemeMode(mode: ThemeMode) {
  if (!['light', 'dark', 'system'].includes(mode)) return
  themeMode.value = mode
  try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* Theme still works without storage. */ }
  applyTheme()
}
export function initializeMobileTheme() {
  if (systemTheme) return
  document.documentElement.classList.add('mobile-edition')
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (['light', 'dark', 'system'].includes(saved)) themeMode.value = saved as ThemeMode
  } catch { /* Use system appearance. */ }
  systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
  systemTheme.addEventListener('change', applyTheme)
  window.addEventListener('zytb-system-theme', applyTheme)
  applyTheme()
}

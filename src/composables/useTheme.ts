import { ref, computed } from 'vue'

export type Skin = 'loshop' | 'aoki' | 'aero' | 'glass'
export type ThemeId =
  | 'loshop-light'
  | 'loshop-dark'
  | 'aoki-light'
  | 'aoki-dark'
  | 'aero-light'
  | 'aero-dark'
  | 'glass-light'
  | 'glass-dark'

export const THEME_OPTIONS: { label: string; value: ThemeId }[] = [
  { label: 'Loshop 亮色', value: 'loshop-light' },
  { label: 'Loshop 深色', value: 'loshop-dark' },
  { label: 'aoki 亮色', value: 'aoki-light' },
  { label: 'aoki 深色', value: 'aoki-dark' },
  { label: 'Aero 亮色', value: 'aero-light' },
  { label: 'Aero 深色', value: 'aero-dark' },
  { label: 'Glass 亮色', value: 'glass-light' },
  { label: 'Glass 深色', value: 'glass-dark' }
]

const STORAGE_KEY = 'aoki-theme'

const THEME_MAP: Record<ThemeId, { skin: Skin; dark: boolean }> = {
  'loshop-light': { skin: 'loshop', dark: false },
  'loshop-dark': { skin: 'loshop', dark: true },
  'aoki-light': { skin: 'aoki', dark: false },
  'aoki-dark': { skin: 'aoki', dark: true },
  'aero-light': { skin: 'aero', dark: false },
  'aero-dark': { skin: 'aero', dark: true },
  'glass-light': { skin: 'glass', dark: false },
  'glass-dark': { skin: 'glass', dark: true }
}

// 默认使用 Loshop 亮色（纯 Element Plus 默认外观）。
export const currentTheme = ref<ThemeId>('loshop-light')
export const currentSkin = computed<Skin>(() => THEME_MAP[currentTheme.value].skin)

let initialized = false

function applyTheme() {
  const { skin, dark } = THEME_MAP[currentTheme.value]
  const root = document.documentElement
  // Loshop = 纯 Element Plus 默认，不加任何皮肤类；其余皮肤挂各自的 edition 类。
  root.classList.remove('aoki-edition', 'aero-edition', 'glass-edition')
  if (skin !== 'loshop') root.classList.add(`${skin}-edition`)
  root.classList.toggle('dark', dark)
  ;(window as any).nativeHost?.setThemeDark(dark).catch(() => {})
}

export function setTheme(id: ThemeId) {
  if (!(id in THEME_MAP)) return
  currentTheme.value = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* Theme still works without storage. */
  }
  applyTheme()
}

export function initializeTheme() {
  if (initialized) return
  initialized = true
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in THEME_MAP) currentTheme.value = saved as ThemeId
  } catch {
    /* Use default appearance. */
  }
  applyTheme()
}

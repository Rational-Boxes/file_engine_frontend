import { ref } from 'vue'

// Light/dark theme, persisted, applied as `data-theme` on <html> (see App.vue vars).
type Theme = 'light' | 'dark'
const KEY = 'fe.theme'
const theme = ref<Theme>('light')

function applyTheme(t: Theme) {
  theme.value = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', t)
  }
}

export function initTheme() {
  let t: Theme = 'light'
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') t = saved
    else if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
      t = 'dark'
  } catch {
    /* ignore */
  }
  applyTheme(t)
}

export function toggleTheme() {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark')
}

export function useTheme() {
  return { theme, toggleTheme, initTheme }
}

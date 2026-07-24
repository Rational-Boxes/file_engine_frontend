// Copyright (C) 2026 James Hickman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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

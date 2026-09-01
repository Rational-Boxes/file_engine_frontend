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

// Applies the deployment's white-label overrides, and exposes the name and mark
// to the components that show them.
//
// Starts on the stock defaults and settles when the file arrives — the same rule
// as capability detection, for the same reason: a brand that appears a moment
// late is a slow page, while a blank header is a broken one.

import { reactive, readonly } from 'vue'
import {
  brandingService,
  DEFAULT_BRANDING,
  PALETTE_VARS,
  type Branding,
  type Palette,
} from '@/services/brandingService'

const STYLE_ID = 'fe-branding-palette'

const state = reactive<Branding>({ ...DEFAULT_BRANDING, light: {}, dark: {} })
let started = false

function declarations(p: Palette): string {
  return (Object.keys(PALETTE_VARS) as Array<keyof Palette>)
    .filter((k) => p[k])
    .map((k) => `  ${PALETTE_VARS[k]}: ${p[k]};`)
    .join('\n')
}

// Overrides are injected as a stylesheet rather than written onto the root
// element, because the dark palette has to live behind its own selector — the
// theme is chosen by [data-theme] and inline styles cannot express that. A
// <style> appended to <head> also lands after the bundled CSS, so equal
// specificity resolves in favour of the override without any !important.
export function applyPalette(b: Branding, doc: Document = document) {
  const light = declarations(b.light)
  const dark = declarations(b.dark)
  doc.getElementById(STYLE_ID)?.remove()
  if (!light && !dark) return
  const el = doc.createElement('style')
  el.id = STYLE_ID
  el.textContent = [
    light ? `:root {\n${light}\n}` : '',
    // Matches App.vue's own dark selector, including .theme-dark, which the 3D
    // viewer chrome uses to stay dark whatever the page theme is.
    dark ? `:root[data-theme='dark'],\n.theme-dark {\n${dark}\n}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  doc.head.appendChild(el)
}

function apply(b: Branding, doc: Document = document) {
  state.appName = b.appName
  state.iconUrl = b.iconUrl
  state.title = b.title
  state.light = b.light
  state.dark = b.dark
  if (typeof doc !== 'undefined' && doc) {
    doc.title = b.title
    applyPalette(b, doc)
  }
}

export function useBranding() {
  if (!started) {
    started = true
    void brandingService.load().then((b) => apply(b))
  }
  return { branding: readonly(state) }
}

/** Test seam. */
export function resetBranding() {
  started = false
  Object.assign(state, { ...DEFAULT_BRANDING, light: {}, dark: {} })
  brandingService.reset()
  if (typeof document !== 'undefined') document.getElementById(STYLE_ID)?.remove()
}

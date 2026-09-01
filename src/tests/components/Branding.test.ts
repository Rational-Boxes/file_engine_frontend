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
//
// White-labelling is only real if the rendered chrome changes, so this asserts
// on the DOM and the injected stylesheet rather than on the state behind them.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/services/brandingService', async () => {
  const actual = await vi.importActual<typeof import('@/services/brandingService')>(
    '@/services/brandingService',
  )
  return { ...actual, brandingService: { load, reset: vi.fn() } }
})

vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: {
    load: vi.fn().mockResolvedValue({
      editing: { available: true, reason: '', extensions: [] },
      chat: { available: true }, webSearch: { available: true }, search: { available: true },
      discussion: { available: true }, sharing: { available: true },
      difference: { available: true }, folderActions: { available: true },
      bcf: { available: true }, audit: { available: true },
    }),
    reset: vi.fn(),
  },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: 'alice', tenant: 'default', accessLevel: 'admin', tenants: [],
    hasAccessLevel: () => true, logout: vi.fn(),
  }),
}))
vi.mock('@/stores/help', () => ({ useHelpStore: () => ({ open: vi.fn() }) }))

import AppNav from '@/components/AppNav.vue'
import { normalise, DEFAULT_BRANDING } from '@/services/brandingService'
import { applyPalette, resetBranding } from '@/composables/useBranding'

const mountNav = () =>
  mount(AppNav, {
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })

describe('AppNav — the deployment’s name and mark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetBranding()
  })

  it('shows the product name when the deployment overrides nothing', async () => {
    load.mockResolvedValue(DEFAULT_BRANDING)
    const w = mountNav()
    await flushPromises()
    expect(w.find('.brand').text()).toBe('FileEngine')
    expect(w.find('.brand-icon').exists()).toBe(false)
  })

  it('shows the deployment’s own name in place of the product’s', async () => {
    load.mockResolvedValue(normalise({ appName: 'Acme Docs' }))
    const w = mountNav()
    await flushPromises()
    expect(w.find('.brand').text()).toBe('Acme Docs')
    expect(w.find('.brand').text()).not.toContain('FileEngine')
  })

  it('shows the mark beside the name when one is configured', async () => {
    load.mockResolvedValue(normalise({ appName: 'Acme Docs', iconUrl: '/brand/acme.svg' }))
    const w = mountNav()
    await flushPromises()
    expect(w.find('.brand-icon').attributes('src')).toBe('/brand/acme.svg')
    // Decorative: the name is right beside it, so a screen reader announcing
    // the logo would just say the same thing twice.
    expect(w.find('.brand-icon').attributes('alt')).toBe('')
  })

  it('drops an off-site mark rather than rendering it', async () => {
    load.mockResolvedValue(normalise({ iconUrl: 'https://cdn.example.com/logo.png' }))
    const w = mountNav()
    await flushPromises()
    expect(w.find('.brand-icon').exists()).toBe(false)
  })
})

describe('palette overrides', () => {
  beforeEach(() => resetBranding())

  it('overrides light and dark independently, behind their own selectors', () => {
    applyPalette(
      normalise({
        light: { primary: '#8b1d3f', bg: '#faf7f8' },
        dark: { primary: '#e0698c' },
      }),
    )
    const css = document.getElementById('fe-branding-palette')?.textContent ?? ''
    expect(css).toContain(':root {')
    expect(css).toContain('--primary: #8b1d3f;')
    expect(css).toContain('--bg: #faf7f8;')
    // The dark palette cannot be an inline style on the root element — it has
    // to sit behind the theme selector, including .theme-dark, which the 3D
    // viewer chrome uses to stay dark whatever the page theme is.
    expect(css).toContain(":root[data-theme='dark']")
    expect(css).toContain('.theme-dark')
    expect(css.split(":root[data-theme='dark']")[1]).toContain('--primary: #e0698c;')
  })

  it('writes nothing at all when no colours are overridden', () => {
    applyPalette(normalise({ appName: 'Acme Docs' }))
    expect(document.getElementById('fe-branding-palette')).toBeNull()
  })

  it('replaces the previous sheet instead of stacking sheets', () => {
    applyPalette(normalise({ light: { primary: '#111111' } }))
    applyPalette(normalise({ light: { primary: '#222222' } }))
    expect(document.querySelectorAll('#fe-branding-palette')).toHaveLength(1)
    expect(document.getElementById('fe-branding-palette')?.textContent)
      .toContain('--primary: #222222;')
  })

  it('never emits a colour that did not survive validation', () => {
    applyPalette(normalise({ light: { primary: 'red; } html { display: none' } }))
    expect(document.getElementById('fe-branding-palette')).toBeNull()
  })
})

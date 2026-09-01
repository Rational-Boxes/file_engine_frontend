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
// The sign-in page is the one screen reachable without an account, so what a
// deployment puts behind it is asserted on the rendered DOM.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/services/brandingService', async () => {
  const actual = await vi.importActual<typeof import('@/services/brandingService')>(
    '@/services/brandingService',
  )
  return { ...actual, brandingService: { load, reset: vi.fn() } }
})

const { oauthProviders } = vi.hoisted(() => ({ oauthProviders: vi.fn() }))
vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<object>('@/services/authService')
  const svc = { oauthProviders, oauthRedirect: vi.fn(), login: vi.fn() }
  return { ...actual, authService: svc, default: svc }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

import LoginView from '@/views/LoginView.vue'
import { normalise } from '@/services/brandingService'
import { resetBranding } from '@/composables/useBranding'

const reduceMotion = (on: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: on && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

const mountLogin = async () => {
  setActivePinia(createPinia())
  const w = mount(LoginView, {
    global: { stubs: { TwoFactorChallenge: true, ProviderIcon: true, RouterLink: true } },
  })
  await flushPromises()
  return w
}

describe('sign-in background media', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetBranding()
    oauthProviders.mockResolvedValue([])
    reduceMotion(false)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows no background at all when the deployment sets none', async () => {
    load.mockResolvedValue(normalise({}))
    const w = await mountLogin()
    expect(w.find('.login-bg').exists()).toBe(false)
  })

  it('loops a video background', async () => {
    load.mockResolvedValue(
      normalise({ login: { backgroundUrl: '/branding/lobby.mp4', posterUrl: '/branding/lobby.jpg' } }),
    )
    const w = await mountLogin()
    const v = w.find('video')
    expect(v.exists()).toBe(true)
    expect(v.attributes('src')).toBe('/branding/lobby.mp4')
    expect(v.attributes('poster')).toBe('/branding/lobby.jpg')
    expect(v.attributes('loop')).toBeDefined()
    // Not a preference: browsers block sound-capable autoplay outright, so
    // without muted the background simply never starts.
    expect(v.attributes('muted')).toBeDefined()
    expect(v.attributes('autoplay')).toBeDefined()
    // Stops iOS taking the video fullscreen over the sign-in form.
    expect(v.attributes('playsinline')).toBeDefined()
    expect(w.find('img.login-bg-media').exists()).toBe(false)
  })

  it('shows an image background as an image', async () => {
    load.mockResolvedValue(normalise({ login: { backgroundUrl: '/branding/lobby.jpg' } }))
    const w = await mountLogin()
    expect(w.find('img.login-bg-media').attributes('src')).toBe('/branding/lobby.jpg')
    expect(w.find('video').exists()).toBe(false)
  })

  it('does not mistake a cache-buster for an image', async () => {
    // A query string made every video match the image branch and render inside
    // an <img>, which fails as a broken-image icon behind the sign-in form.
    load.mockResolvedValue(normalise({ login: { backgroundUrl: '/branding/lobby.webm?v=3' } }))
    const w = await mountLogin()
    expect(w.find('video').exists()).toBe(true)
  })

  it('paints a scrim over the media so the form stays readable', async () => {
    load.mockResolvedValue(
      normalise({ login: { backgroundUrl: '/branding/lobby.jpg', overlay: 'rgba(0, 0, 0, 0.7)' } }),
    )
    const w = await mountLogin()
    expect(w.find('.login-bg-scrim').attributes('style')).toContain('rgba(0, 0, 0, 0.7)')
  })

  it('keeps the background decorative rather than announcing it', async () => {
    load.mockResolvedValue(normalise({ login: { backgroundUrl: '/branding/lobby.mp4' } }))
    const w = await mountLogin()
    expect(w.find('.login-bg').attributes('aria-hidden')).toBe('true')
  })

  it('refuses an off-site background', async () => {
    load.mockResolvedValue(
      normalise({ login: { backgroundUrl: 'https://cdn.example.com/lobby.mp4' } }),
    )
    const w = await mountLogin()
    expect(w.find('.login-bg').exists()).toBe(false)
  })

  describe('when the visitor has asked for reduced motion', () => {
    beforeEach(() => {
      reduceMotion(true)
    })

    it('shows the still instead of playing the loop', async () => {
      load.mockResolvedValue(
        normalise({
          login: { backgroundUrl: '/branding/lobby.mp4', posterUrl: '/branding/lobby.jpg' },
        }),
      )
      const w = await mountLogin()
      expect(w.find('video').exists()).toBe(false)
      expect(w.find('img.login-bg-media').attributes('src')).toBe('/branding/lobby.jpg')
    })

    it('falls back to the ordinary page rather than a blank rectangle', async () => {
      // No poster means there is no still to show, so there is nothing to put
      // in the video's place.
      load.mockResolvedValue(normalise({ login: { backgroundUrl: '/branding/lobby.mp4' } }))
      const w = await mountLogin()
      expect(w.find('.login-bg').exists()).toBe(false)
    })

    it('still shows a static image background, which is not motion', async () => {
      load.mockResolvedValue(normalise({ login: { backgroundUrl: '/branding/lobby.jpg' } }))
      const w = await mountLogin()
      expect(w.find('img.login-bg-media').exists()).toBe(true)
    })
  })
})

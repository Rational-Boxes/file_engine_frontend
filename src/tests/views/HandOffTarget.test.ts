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

/**
 * What survives a bounce through the shared sign-in origin.
 *
 * Two parameters were being WRITTEN by one side and ignored by the other, which
 * is the quietest kind of bug — everything appears to work, you just always end
 * up somewhere else:
 *
 *   ?t=<tenant>  the router guard set it; LoginView never read it, so a bounce
 *                landed on the REMEMBERED workspace. This is what made tenant
 *                switching look like a no-op.
 *   ?next=<path> LoginView set it; SsoLandingView only understood ?target=<uid>,
 *                so every deep link was silently replaced by the dashboard.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { ssoHandoff, oauthProviders, reachable, replace, redeemSso, query } = vi.hoisted(() => ({
  ssoHandoff: vi.fn(), oauthProviders: vi.fn(), reachable: vi.fn(),
  replace: vi.fn(), redeemSso: vi.fn(), query: { value: {} as Record<string, string> },
}))

vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<object>('@/services/authService')
  const svc = { ssoHandoff, oauthProviders, oauthRedirect: vi.fn(), login: vi.fn() }
  return { ...actual, authService: svc, default: svc }
})
vi.mock('@/utils/tenantReach', () => ({
  tenantOriginReachable: reachable, forgetReachability: vi.fn(),
}))
vi.mock('@/utils/tenantHost', async () => {
  const actual = await vi.importActual<object>('@/utils/tenantHost')
  return { ...actual, isLoginOrigin: () => true, tenantOrigin: (t: string) => `https://${t}.example.com` }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: query.value }),
  useRouter: () => ({ push: vi.fn(), replace, currentRoute: { value: { path: '/sso' } } }),
}))

import LoginView from '@/views/LoginView.vue'
import SsoLandingView from '@/views/SsoLandingView.vue'
import { useAuthStore } from '@/stores/auth'

beforeEach(() => {
  oauthProviders.mockReset().mockResolvedValue([])
  ssoHandoff.mockReset().mockResolvedValue('one-time-code')
  reachable.mockReset().mockResolvedValue(true)
  replace.mockReset()
  redeemSso.mockReset().mockResolvedValue(true)
  query.value = {}
  window.localStorage.clear(); window.sessionStorage.clear()
  vi.stubGlobal('window', Object.assign(Object.create(window), {
    location: { href: '', hostname: 'login.example.com', protocol: 'https:', port: '' },
    localStorage: window.localStorage, sessionStorage: window.sessionStorage,
  }))
})

function signedInAt(tenants: string[]) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'a-token'
  auth.tenants = tenants
  auth.user = { username: 'someone' } as never
  const w = mount(LoginView, { global: { stubs: { RouterLink: true, TwoFactorChallenge: true } } })
  return { w, auth }
}

describe('the requested tenant survives the bounce', () => {
  it('goes to the tenant that was asked for, not the remembered one', async () => {
    // Exactly the switching failure: last-used is acme, the bounce asks for
    // someco. Before the fix this returned the user to acme.
    window.localStorage.setItem('fe_last_tenant', 'acme')
    query.value = { t: 'someco' }
    signedInAt(['acme', 'someco'])
    await flushPromises()

    expect(ssoHandoff).toHaveBeenCalledWith('someco')
    expect(window.location.href).toContain('https://someco.example.com/sso')
  })

  it('ignores a tenant the token does not carry', async () => {
    // The parameter is a URL hint. The token's list is the authority — a hint
    // must never widen access, only choose among what is already permitted.
    window.localStorage.setItem('fe_last_tenant', 'acme')
    query.value = { t: 'not-mine' }
    signedInAt(['acme', 'someco'])
    await flushPromises()
    expect(ssoHandoff).toHaveBeenCalledWith('acme')
  })

  it('falls back to the remembered workspace when nothing is requested', async () => {
    window.localStorage.setItem('fe_last_tenant', 'someco')
    signedInAt(['acme', 'someco'])
    await flushPromises()
    expect(ssoHandoff).toHaveBeenCalledWith('someco')
  })

  it('carries the intended path along with the tenant', async () => {
    query.value = { t: 'someco', next: '/files?file=abc' }
    signedInAt(['acme', 'someco'])
    await flushPromises()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('next')).toBe('/files?file=abc')
  })
})

describe('the SSO landing honours where you were headed', () => {
  function land() {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.redeemSso = redeemSso as never
    return mount(SsoLandingView)
  }

  it('follows ?next, which the sign-in origin actually sends', async () => {
    // It only understood ?target before, so every hand-off landed on /dashboard
    // and the deep link was lost.
    query.value = { code: 'c', next: '/files?file=abc' }
    land()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/files?file=abc')
  })

  it('still understands ?target for the outside-system entry point', async () => {
    query.value = { code: 'c', target: 'uid-123' }
    land()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/files?file=uid-123')
  })

  it('refuses a full URL in ?next', async () => {
    // Reached pre-auth and acts immediately, so this is the open-redirect guard
    // that matters most.
    query.value = { code: 'c', next: 'https://evil.example.com/steal' }
    land()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/dashboard')
  })

  it('refuses a protocol-relative //host in ?next', async () => {
    query.value = { code: 'c', next: '//evil.example.com/steal' }
    land()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/dashboard')
  })

  it('lands on the dashboard when nothing was carried', async () => {
    query.value = { code: 'c' }
    land()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/dashboard')
  })
})

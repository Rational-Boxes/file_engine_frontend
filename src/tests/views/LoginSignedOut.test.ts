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
 * Signing out has to actually end the session, on BOTH origins.
 *
 * Reported from production: sign out and you land on the dashboard, signed in.
 * The tenant origin discarded its token correctly — but the sign-in origin holds
 * a separate token of its own, minted when the user signed in there, and the
 * hand-off on mount rode it straight back to a workspace.
 *
 * That is not only a confusing redirect: the session was left valid for whoever
 * used the machine next.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { oauthProviders, ssoHandoff, reachable, logout, query } = vi.hoisted(() => ({
  oauthProviders: vi.fn(), ssoHandoff: vi.fn(), reachable: vi.fn(), logout: vi.fn(),
  query: { value: {} as Record<string, string> },
}))

vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<object>('@/services/authService')
  const svc = { oauthProviders, ssoHandoff, oauthRedirect: vi.fn(), login: vi.fn(), logout }
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { path: '/login' } } }),
}))

import LoginView from '@/views/LoginView.vue'
import { useAuthStore } from '@/stores/auth'

function mountWithSession() {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'the-sign-in-origins-own-token'
  auth.tenants = ['arcdigital']
  auth.user = { username: 'john@arcdigitalservices.com' } as never
  const w = mount(LoginView, {
    global: { stubs: { RouterLink: true, TwoFactorChallenge: true } },
  })
  return { w, auth }
}

beforeEach(() => {
  oauthProviders.mockReset().mockResolvedValue([])
  ssoHandoff.mockReset().mockResolvedValue('one-time-code')
  reachable.mockReset().mockResolvedValue(true)
  logout.mockReset().mockResolvedValue(undefined)
  query.value = {}
  window.localStorage.clear()
  vi.stubGlobal('window', Object.assign(Object.create(window), {
    location: { href: '', hostname: 'login.example.com', protocol: 'https:', port: '' },
    sessionStorage: window.sessionStorage,
    localStorage: window.localStorage,
  }))
})

describe('arriving at the sign-in origin after an explicit sign-out', () => {
  beforeEach(() => {
    query.value = { signedout: '1' }
  })

  it('shows the sign-in form instead of bouncing to a workspace', async () => {
    const { w } = mountWithSession()
    await flushPromises()

    expect(ssoHandoff).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
    expect(w.find('form.ldap-form').exists()).toBe(true)
  })

  it('ends this origin’s session rather than only ignoring it', async () => {
    // Clearing the local copy is not enough: the token stays valid at the bridge
    // and the next person on this machine could use it.
    const { auth } = mountWithSession()
    await flushPromises()

    expect(logout).toHaveBeenCalled()
    expect(auth.token).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
})

describe('arriving at the sign-in origin any other way', () => {
  it('still hands an existing session on to a workspace', async () => {
    // The second-tab case, which must keep working: no sign-out happened, so
    // there is nothing to end and nothing to ask again.
    mountWithSession()
    await flushPromises()

    expect(logout).not.toHaveBeenCalled()
    expect(ssoHandoff).toHaveBeenCalledWith('arcdigital')
  })
})

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
 * Switching workspace from a tenant subdomain.
 *
 * This was broken in a way that looked like nothing happening at all. The
 * switcher navigated straight to the other origin — but the token lives in
 * localStorage, which is ORIGIN-SCOPED, so the destination had no session, its
 * router guard bounced to the sign-in origin, and the sign-in origin (which was
 * ignoring the `?t=` it had been handed) sent the user back to their remembered
 * workspace: the one they had just tried to leave.
 *
 * Three separate defects lined up to produce that, and each is pinned here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

const { ssoHandoff, reachable, assign, reload } = vi.hoisted(() => ({
  ssoHandoff: vi.fn(), reachable: vi.fn(), assign: vi.fn(), reload: vi.fn(),
}))

vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<object>('@/services/authService')
  const svc = { ssoHandoff, whoami: vi.fn(), oauthProviders: vi.fn() }
  return { ...actual, authService: svc, default: svc }
})
vi.mock('@/utils/tenantReach', () => ({
  tenantOriginReachable: reachable, forgetReachability: vi.fn(),
}))

import TenantSelector from '@/components/TenantSelector.vue'
import { useAuthStore } from '@/stores/auth'

function mountSwitcher(host = 'acme.example.com') {
  vi.stubGlobal('window', Object.assign(Object.create(window), {
    location: {
      protocol: 'https:', hostname: host, port: '', pathname: '/files',
      search: '', hash: '', href: `https://${host}/files`, assign, reload,
    },
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
  }))
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'a-token'
  auth.tenant = 'acme'
  auth.tenants = ['acme', 'someco']
  const w = mount(TenantSelector)
  return { w, auth }
}

async function pick(w: ReturnType<typeof mountSwitcher>['w'], value: string) {
  const select = w.find('select')
  ;(select.element as HTMLSelectElement).value = value
  await select.trigger('change')
  await flushPromises()
}

beforeEach(() => {
  ssoHandoff.mockReset().mockResolvedValue('one-time-code')
  reachable.mockReset()
  assign.mockReset(); reload.mockReset()
  window.localStorage.clear(); window.sessionStorage.clear()
})

describe('switching to another tenant subdomain', () => {
  it('carries the session instead of arriving signed out', async () => {
    // The defect: navigating bare to https://someco.example.com left the token
    // behind, because localStorage does not cross origins.
    reachable.mockResolvedValue(true)
    const { w } = mountSwitcher()
    await pick(w, 'someco')

    expect(ssoHandoff).toHaveBeenCalledWith('someco')
    const url = new URL(assign.mock.calls[0][0])
    expect(url.hostname).toBe('someco.example.com')
    expect(url.pathname).toBe('/sso')
    expect(url.searchParams.get('code')).toBe('one-time-code')
    expect(reload).not.toHaveBeenCalled()
  })

  it('remembers the workspace it is moving to, not the one being left', async () => {
    reachable.mockResolvedValue(true)
    const { w } = mountSwitcher()
    await pick(w, 'someco')
    expect(window.localStorage.getItem('fe_last_tenant')).toBe('someco')
  })

  it('switches in place when the target subdomain is not serving the app', async () => {
    // Forwarding there would strand the user on a browser error page.
    reachable.mockResolvedValue(false)
    const { w, auth } = mountSwitcher()
    await pick(w, 'someco')

    expect(assign).not.toHaveBeenCalled()
    expect(ssoHandoff).not.toHaveBeenCalled()   // no code minted for a trip not taken
    expect(auth.tenant).toBe('someco')
    expect(reload).toHaveBeenCalled()
  })

  it('switches in place when the hand-off itself fails', async () => {
    reachable.mockResolvedValue(true)
    ssoHandoff.mockRejectedValue(new Error('handoff exploded'))
    const { w, auth } = mountSwitcher()
    await pick(w, 'someco')

    expect(assign).not.toHaveBeenCalled()
    expect(auth.tenant).toBe('someco')
    expect(reload).toHaveBeenCalled()
  })

  it('does nothing when the same tenant is re-selected', async () => {
    reachable.mockResolvedValue(true)
    const { w } = mountSwitcher()
    await pick(w, 'acme')
    expect(assign).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads in place on a single-domain deployment', async () => {
    // No subdomain tenancy: there is no other origin to move to.
    const { w, auth } = mountSwitcher('localhost')
    await pick(w, 'someco')
    expect(assign).not.toHaveBeenCalled()
    expect(auth.tenant).toBe('someco')
    expect(reload).toHaveBeenCalled()
  })
})

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
 * Signing in on a tenant subdomain that is not one of yours.
 *
 * A tenant origin picks its workspace from the HOSTNAME, before anyone has
 * authenticated — so it can name a tenant the account is not a member of. That
 * happens for real: someone is handed the deployment's main address, or keeps a
 * bookmark from a workspace they have left.
 *
 * Reported from production: a new tenant administrator signed in successfully
 * and then had every request refused with "not a member of the requested
 * tenant". The session was valid; it was pinned to the wrong workspace, which
 * reads as a broken account rather than the wrong address.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { oauthProviders, ssoHandoff, reachable, replace, hostTenant } = vi.hoisted(() => ({
  oauthProviders: vi.fn(), ssoHandoff: vi.fn(), reachable: vi.fn(), replace: vi.fn(),
  hostTenant: vi.fn(),
}))

vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<object>('@/services/authService')
  const svc = { oauthProviders, ssoHandoff, oauthRedirect: vi.fn(), login: vi.fn() }
  return { ...actual, authService: svc, default: svc }
})
vi.mock('@/utils/tenantReach', () => ({
  tenantOriginReachable: reachable, forgetReachability: vi.fn(),
}))
// On a TENANT origin, not the shared sign-in one — that is the whole point.
vi.mock('@/utils/tenantHost', async () => {
  const actual = await vi.importActual<object>('@/utils/tenantHost')
  return {
    ...actual,
    isLoginOrigin: () => false,
    activeTenantFromHost: hostTenant,
    tenantOrigin: (t: string) => `https://${t}.example.com`,
  }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace, currentRoute: { value: { path: '/dashboard' } } }),
}))

import LoginView from '@/views/LoginView.vue'
import { useAuthStore } from '@/stores/auth'
import { rememberTenantFor } from '@/utils/lastTenant'

/** Mount the sign-in page and complete a password sign-in that yields `tenants`. */
async function signIn(tenants: string[]) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  const w = mount(LoginView, {
    global: { stubs: { RouterLink: true, TwoFactorChallenge: true } },
  })
  await flushPromises()
  // Stub the credential exchange, not the routing: what is under test is where
  // goAfterLogin sends someone once a session exists.
  vi.spyOn(auth, 'ldapLogin').mockImplementation(async () => {
    auth.token = 'a-token'
    auth.tenants = tenants
    auth.user = 'john@arcdigitalservices.com'
    return true
  })
  await w.find('form.ldap-form').trigger('submit')
  await flushPromises()
  return { w, auth }
}

beforeEach(() => {
  oauthProviders.mockReset().mockResolvedValue([])
  ssoHandoff.mockReset().mockResolvedValue('one-time-code')
  reachable.mockReset().mockResolvedValue(true)
  replace.mockReset()
  hostTenant.mockReset()
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.stubGlobal('window', Object.assign(Object.create(window), {
    location: { href: '', hostname: 'default.example.com', protocol: 'https:', port: '' },
    sessionStorage: window.sessionStorage,
    localStorage: window.localStorage,
  }))
})

describe('signing in on a workspace that is not yours', () => {
  it('forwards to the subdomain of a workspace the account actually has', async () => {
    hostTenant.mockReturnValue('default')
    await signIn(['arcdigital'])

    expect(ssoHandoff).toHaveBeenCalledWith('arcdigital')
    expect(window.location.href).toContain('https://arcdigital.example.com/sso')
    // Emphatically NOT an in-app navigation on this origin: staying would leave
    // the session pinned to "default" and every request refused.
    expect(replace).not.toHaveBeenCalled()
  })

  it('leaves you where you are when the workspace IS yours', async () => {
    hostTenant.mockReturnValue('arcdigital')
    await signIn(['arcdigital'])

    expect(ssoHandoff).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
    expect(replace).toHaveBeenCalled()
  })

  it('does not forward on no evidence when the tenant list is unknown', async () => {
    // loadTenants failed, so membership is unknown. Bouncing on that would be
    // worse than landing here and letting the request that fails say why.
    hostTenant.mockReturnValue('default')
    await signIn([])

    expect(ssoHandoff).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalled()
  })

  it('serves the workspace in place when its subdomain does not answer', async () => {
    hostTenant.mockReturnValue('default')
    reachable.mockResolvedValue(false)
    const { auth } = await signIn(['arcdigital'])

    expect(window.location.href).toBe('')          // no forward to a dead host
    expect(replace).toHaveBeenCalledWith('/dashboard')
    // Still correctly scoped: the tenant rides as X-Tenant, which the bridge
    // honours regardless of host. That is what makes the fallback usable.
    expect(auth.tenant).toBe('arcdigital')
  })

  it('prefers the remembered workspace when it is still one of theirs', async () => {
    hostTenant.mockReturnValue('default')
    rememberTenantFor('john@arcdigitalservices.com', 'beta')
    await signIn(['arcdigital', 'beta'])

    expect(ssoHandoff).toHaveBeenCalledWith('beta')
  })

  it('ignores a remembered workspace the account no longer has', async () => {
    // The hint is not a credential: the token's list is the authority.
    hostTenant.mockReturnValue('default')
    rememberTenantFor('john@arcdigitalservices.com', 'somewhere-else')
    await signIn(['arcdigital'])

    expect(ssoHandoff).toHaveBeenCalledWith('arcdigital')
  })
})

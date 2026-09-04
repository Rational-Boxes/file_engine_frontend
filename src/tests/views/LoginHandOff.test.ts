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
 * Where an authenticated user ends up after signing in at the shared origin.
 *
 * Forwarding to the tenant's own subdomain is preferred and stays the default.
 * The fallback exists because a deployment can have tenants whose subdomain was
 * never set up — forwarding there strands the user on a browser error page, on
 * a host our own code cannot reach to explain from.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { oauthProviders, ssoHandoff, reachable, replace } = vi.hoisted(() => ({
  oauthProviders: vi.fn(), ssoHandoff: vi.fn(), reachable: vi.fn(), replace: vi.fn(),
}))

vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<object>('@/services/authService')
  const svc = { oauthProviders, ssoHandoff, oauthRedirect: vi.fn(), login: vi.fn() }
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
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace, currentRoute: { value: { path: '/dashboard' } } }),
}))

import LoginView from '@/views/LoginView.vue'
import { useAuthStore } from '@/stores/auth'

function mountAuthenticated(tenants: string[]) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'a-token'
  auth.tenants = tenants
  auth.user = 'someone'
  const w = mount(LoginView, {
    global: { stubs: { RouterLink: true, TwoFactorChallenge: true } },
  })
  return { w, auth }
}

beforeEach(() => {
  oauthProviders.mockReset().mockResolvedValue([])
  ssoHandoff.mockReset().mockResolvedValue('one-time-code')
  reachable.mockReset()
  replace.mockReset()
  window.sessionStorage.clear()
  // jsdom forbids assigning window.location.href; a plain object lets the
  // forward be observed instead of throwing.
  vi.stubGlobal('window', Object.assign(Object.create(window), {
    location: { href: '', hostname: 'login.example.com', protocol: 'https:', port: '' },
    sessionStorage: window.sessionStorage,
    localStorage: window.localStorage,
  }))
})

describe('after signing in at the shared origin', () => {
  it('forwards to the tenant subdomain when it is reachable', async () => {
    reachable.mockResolvedValue(true)
    mountAuthenticated(['acme'])
    await flushPromises()

    expect(ssoHandoff).toHaveBeenCalledWith('acme')
    expect(window.location.href).toContain('https://acme.example.com/sso')
    expect(window.location.href).toContain('code=one-time-code')
    expect(replace).not.toHaveBeenCalled()   // did not stay
  })

  it('stays on the sign-in origin when the subdomain does not answer', async () => {
    reachable.mockResolvedValue(false)
    const { auth } = mountAuthenticated(['acme'])
    await flushPromises()

    expect(window.location.href).toBe('')     // no forward to a dead host
    expect(replace).toHaveBeenCalledWith('/dashboard')
    // ...and the workspace is genuinely scoped: the tenant rides as X-Tenant,
    // which the bridge honours regardless of host. This is the whole reason the
    // fallback is usable rather than a dead end.
    expect(auth.tenant).toBe('acme')
  })

  it('does not mint a hand-off code it is not going to use', async () => {
    reachable.mockResolvedValue(false)
    mountAuthenticated(['acme'])
    await flushPromises()
    expect(ssoHandoff).not.toHaveBeenCalled()
  })

  it('falls back rather than dead-ending when the hand-off itself fails', async () => {
    // The origin answered, so this is our problem, not the destination's. The
    // user should land in a working app, not on an error they cannot act on.
    reachable.mockResolvedValue(true)
    ssoHandoff.mockRejectedValue(new Error('handoff exploded'))
    const { auth } = mountAuthenticated(['acme'])
    await flushPromises()

    expect(replace).toHaveBeenCalledWith('/dashboard')
    expect(auth.tenant).toBe('acme')
  })

  it('says so plainly when the account is in no workspace at all', async () => {
    reachable.mockResolvedValue(true)
    const { auth } = mountAuthenticated([])
    await flushPromises()

    expect(auth.error).toContain('not a member of any workspace')
    expect(replace).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })
})

describe('a FRESH sign-in on the shared origin forwards too', () => {
  // The regression that made this look like the reachability fallback:
  // handOffToWorkspace was only reachable from onMounted (the "already signed
  // in, second tab" case), so signing in with the password form fell through to
  // an in-app router.replace and stayed on the sign-in subdomain. The app
  // WORKED — the tenant rides as X-Tenant — which is exactly why it read as the
  // fallback rather than as a forward that never happened.
  async function signIn(tenants: string[]) {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.tenants = tenants
    auth.user = 'someone'
    // Succeeds and leaves a session behind, like the real action does.
    auth.ldapLogin = (async () => { auth.token = 'a-token'; return true }) as never
    // Signed OUT at mount, so onMounted must not hand off — this has to come
    // from the sign-in itself.
    const w = mount(LoginView, { global: { stubs: { RouterLink: true, TwoFactorChallenge: true } } })
    await flushPromises()
    expect(ssoHandoff).not.toHaveBeenCalled()
    await w.find('form').trigger('submit')
    await flushPromises()
    return { w, auth }
  }

  it('forwards to the tenant origin instead of routing in place', async () => {
    reachable.mockResolvedValue(true)
    await signIn(['acme'])
    expect(ssoHandoff).toHaveBeenCalledWith('acme')
    expect(window.location.href).toContain('https://acme.example.com/sso')
    expect(replace).not.toHaveBeenCalled()   // it did NOT just navigate in-app
  })

  it('still falls back to this origin when the tenant subdomain is absent', async () => {
    reachable.mockResolvedValue(false)
    const { auth } = await signIn(['acme'])
    expect(ssoHandoff).not.toHaveBeenCalled()
    expect(auth.tenant).toBe('acme')          // scoped via X-Tenant, app works here
    expect(window.location.href).toBe('')
  })
})

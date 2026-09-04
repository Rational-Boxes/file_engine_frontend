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
 * The active-tenant pin must not outlive the session that chose it.
 *
 * Reported from production: sign out, sign back in as somebody from a DIFFERENT
 * tenant, and the app says "not a member of the requested tenant" — /v1/whoami
 * 403s and the session is dead on arrival, for an account that is perfectly
 * fine.
 *
 * The pin (`fileengine_tenant` in localStorage) is what every request is stamped
 * with as `X-Tenant`. It is chosen while signed OUT — from the subdomain, or
 * from what this origin last remembered — so it can name a workspace the person
 * signing in is not in. The bridge issues their session for a tenant they ARE in
 * (issueToken falls back to their first) and then refuses every request that
 * names the other one. Verified against the live bridge: login 200, token minted
 * for `default`, whoami with `X-Tenant: filenginetest` → 403.
 *
 * Two things have to hold, and both are tested here: a sign-out forgets the pin,
 * and a pin that is wrong anyway is dropped rather than believed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import axios from 'axios'

// A stateful stand-in for the real storage: these tests are about what is left
// behind between sessions, which a bag of bare spies cannot express.
const { store } = vi.hoisted(() => ({
  store: { token: null as string | null, tenant: null as string | null, tenants: [] as string[] },
}))

vi.mock('@/services/authService', () => ({
  authService: {
    ldapLogin: vi.fn(),
    whoami: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    listTenants: vi.fn(async () => ({ tenants: [], current: '' })),
  },
}))

vi.mock('@/utils/tokenStorage', () => ({
  tokenStorage: {
    getAccessToken: vi.fn(() => store.token),
    getTokens: vi.fn(() => null), // null => scheduleRefresh sets no timer in tests
    clearTokens: vi.fn(() => {
      store.token = null
      store.tenant = null
      store.tenants = []
    }),
    getActiveTenant: vi.fn(() => store.tenant),
    setActiveTenant: vi.fn((t: string | null) => {
      store.tenant = t
    }),
    getTenants: vi.fn(() => store.tenants),
    setTenants: vi.fn((t: string[]) => {
      store.tenants = t
    }),
  },
}))

const { activeTenantFromHost } = vi.hoisted(() => ({
  activeTenantFromHost: vi.fn(() => null as string | null),
}))
vi.mock('@/utils/tenantHost', async () => ({
  ...(await vi.importActual<object>('@/utils/tenantHost')),
  activeTenantFromHost,
}))

import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'
import { tokenStorage } from '@/utils/tokenStorage'

// What the bridge actually answers a request that names a tenant the token does
// not carry (measured, not invented — see the header comment).
function notAMember() {
  return new axios.AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 403,
    data: { error: 'not a member of the requested tenant' },
  } as never)
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  // The per-user workspace memory is REAL storage here, not a mock, and it
  // deliberately outlives a sign-out — so it also outlives a test. Clear it, or
  // a name remembered in one case silently aims the next one's login.
  window.localStorage.clear()
  store.token = 'tok'
  store.tenant = null
  store.tenants = []
  activeTenantFromHost.mockReturnValue(null)
  ;(authService.logout as never as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

describe('signing out forgets which workspace was in use', () => {
  it('clears the persisted tenant pin, not just the token', async () => {
    store.tenant = 'acme'
    store.tenants = ['acme']
    const auth = useAuthStore()
    auth.tenant = 'acme'
    auth.tenants = ['acme']

    await auth.logout()

    expect(store.tenant).toBeNull() // the X-Tenant every request would carry
    expect(store.tenants).toEqual([])
    expect(auth.tenant).toBeNull()
    expect(tokenStorage.clearTokens).toHaveBeenCalled()
  })

  it('clears it BEFORE waiting on the bridge, not after', async () => {
    // Signing out navigates, and App.vue's initTenantFromHost runs on the next
    // tick — while the revoke is still in flight. If the pin were still readable
    // then, it would be read straight back into the store and the sign-out would
    // have forgotten nothing.
    store.tenant = 'acme'
    let pinDuringRevoke: string | null = 'not observed'
    ;(authService.logout as never as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      pinDuringRevoke = store.tenant
    })

    await useAuthStore().logout()

    expect(pinDuringRevoke).toBeNull()
  })

  it('still revokes at the bridge (the token has to survive until then)', async () => {
    store.tenant = 'acme'
    await useAuthStore().logout()
    expect(authService.logout).toHaveBeenCalled()
  })

  it('drops the previous user’s destination and serve-here decision', async () => {
    // Both are session state hiding in module/session storage. The stash would
    // replay where the LAST user was going — possibly a deep link naming a file
    // that was never the next user's — and the serve-here flag would put their
    // sign-in on the sign-in origin's own dashboard instead of forwarding it.
    const { markServingFromLoginOrigin, servingFromLoginOrigin } =
      await import('@/utils/loginOriginServe')
    const { stashRedirect, takeRedirect } = await import('@/utils/redirect')
    stashRedirect('/files?file=someone-elses-uid')
    markServingFromLoginOrigin()

    await useAuthStore().logout()

    expect(takeRedirect()).toBe('/dashboard') // i.e. nothing stashed
    expect(servingFromLoginOrigin()).toBe(false)
  })

  it('forgetLocalSession clears the pin with no session to revoke', () => {
    // The sign-in origin after a sign-out on a tenant origin: its own token has
    // usually expired, so there is nothing to end — but its pin is still there,
    // and it is the one the next sign-in would be stamped with.
    store.token = null
    store.tenant = 'acme'

    useAuthStore().forgetLocalSession()

    expect(store.tenant).toBeNull()
    expect(authService.logout).not.toHaveBeenCalled()
  })
})

describe('bootstrap off a tenant host', () => {
  it('keeps the persisted pin while a session owns it', () => {
    store.token = 'tok'
    store.tenant = 'acme'
    const auth = useAuthStore()

    auth.initTenantFromHost()

    expect(auth.tenant).toBe('acme')
    expect(store.tenant).toBe('acme')
  })

  it('drops a pin left behind with no session', () => {
    // Nobody is signed in, so this names the LAST person's workspace. Adopting
    // it aims the next sign-in at a tenant the next user may not be in.
    store.token = null
    store.tenant = 'acme'
    const auth = useAuthStore()

    auth.initTenantFromHost()

    expect(auth.tenant).toBeNull()
    expect(store.tenant).toBeNull()
  })

  it('the subdomain still wins where there is one', () => {
    activeTenantFromHost.mockReturnValue('beta')
    store.token = null
    store.tenant = 'acme'
    const auth = useAuthStore()

    auth.initTenantFromHost()

    expect(auth.tenant).toBe('beta')
    expect(store.tenant).toBe('beta')
  })
})

describe('signing in with a pin that names the wrong workspace', () => {
  it('drops the pin and lands the session on the tenant it was issued for', async () => {
    // The reported failure, end to end: a `beta` user signs in where `acme` was
    // remembered. The bridge issues their session for `beta` and refuses the
    // `acme`-stamped whoami.
    store.tenant = 'acme'
    const whoami = authService.whoami as never as ReturnType<typeof vi.fn>
    whoami.mockRejectedValueOnce(notAMember())
    whoami.mockResolvedValueOnce({ user: 'bob', tenant: 'beta', roles: ['users'] })
    ;(authService.ldapLogin as never as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'session' })

    const auth = useAuthStore()
    const ok = await auth.ldapLogin('bob', 'pw')

    expect(ok).toBe(true) // NOT "not a member of the requested tenant" on the form
    expect(auth.error).toBeNull()
    expect(auth.user).toBe('bob')
    expect(auth.tenant).toBe('beta')
    expect(store.tenant).toBe('beta') // persisted, or the next request re-breaks it
    expect(whoami).toHaveBeenCalledTimes(2)
  })

  it('does not retry when there is no pin to blame', async () => {
    store.tenant = null
    const whoami = authService.whoami as never as ReturnType<typeof vi.fn>
    whoami.mockRejectedValue(notAMember())
    ;(authService.ldapLogin as never as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'session' })

    const auth = useAuthStore()
    expect(await auth.ldapLogin('bob', 'pw')).toBe(false)
    expect(whoami).toHaveBeenCalledTimes(1)
  })

  it('leaves a 2fa_required 403 alone — that one is about the session', async () => {
    // The response interceptor has already sent the user back to sign in; asking
    // again without the tenant would only produce a second, confusing failure.
    store.tenant = 'acme'
    const whoami = authService.whoami as never as ReturnType<typeof vi.fn>
    whoami.mockRejectedValue(
      new axios.AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 403,
        data: { error: '2fa_required', tenant: 'acme' },
      } as never),
    )
    ;(authService.ldapLogin as never as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'session' })

    const auth = useAuthStore()
    expect(await auth.ldapLogin('bob', 'pw')).toBe(false)
    expect(whoami).toHaveBeenCalledTimes(1)
  })
})

describe('the workspace memory is per user, and survives the sign-out', () => {
  // The point of the whole change, stated as a scenario: A works in acme, B
  // works in beta, they share a browser, and neither one's sign-in is aimed by
  // the other's history.
  const login = async (user: string, tenant: string) => {
    const auth = useAuthStore()
    ;(authService.ldapLogin as never as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'session' })
    ;(authService.whoami as never as ReturnType<typeof vi.fn>).mockResolvedValue({
      user, tenant, roles: ['users'],
    })
    await auth.ldapLogin(user, 'pw')
    return auth
  }

  it('brings user A back to A’s workspace, and aims B at nothing', async () => {
    await (await login('a@example.com', 'acme')).logout()
    setActivePinia(createPinia())

    // B signs in on the same browser. The login must NOT carry acme.
    await login('b@example.com', 'beta')
    expect(authService.ldapLogin).toHaveBeenLastCalledWith('b@example.com', 'pw', undefined)

    // ...and A coming back still gets acme.
    setActivePinia(createPinia())
    await login('a@example.com', 'acme')
    expect(authService.ldapLogin).toHaveBeenLastCalledWith('a@example.com', 'pw', 'acme')
  })

  it('does not leave the tenant pin behind for whoever signs in next', async () => {
    const auth = await login('a@example.com', 'acme')
    expect(store.tenant).toBe('acme') // pinned while A is signed in

    await auth.logout()

    expect(store.tenant).toBeNull() // ...and gone the moment A signs out
  })
})

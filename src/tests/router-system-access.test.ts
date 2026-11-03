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
 * Who may open System now that Prompt sets lives there.
 *
 * Prompt sets moved from its own page to a tab of System, which is admin-only.
 * The extraction_editors role exists so maintaining extraction is not an
 * admin-only job, so the System ROUTE lets that role in too (the view then shows
 * it only the Prompt sets tab). The exception is per route: every other admin
 * page must stay closed to an editor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import router, { authGuard } from '@/router'
import { useAuthStore, resetBootForTests } from '@/stores/auth'
import { tokenStorage } from '@/utils/tokenStorage'

vi.mock('@/utils/tenantHost', async () => {
  const actual = await vi.importActual<object>('@/utils/tenantHost')
  return { ...actual, isLoginOrigin: vi.fn(() => false), activeTenantFromHost: vi.fn(() => null) }
})
// The identity a page load learns from the bridge.
const whoami = vi.hoisted(() => vi.fn())
vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<{ authService: object }>('@/services/authService')
  return { ...actual, authService: { ...actual.authService, whoami,
    listTenants: vi.fn(async () => ({ tenants: ['default'] })) } }
})

// resolve() matches without navigating, so the policy is examined on its own
// (the same arrangement as router-signed-out.test.ts).
const at = (path: string) => {
  const r = router.resolve(path)
  return authGuard({ ...r, name: r.name ?? undefined })
}

// In-app navigation: the identity is already known.
function as(accessLevel: 'user' | 'admin', roles: string[] = []) {
  const auth = useAuthStore()
  auth.token = 'a-session'
  auth.user = 'someone@example.com'
  auth.accessLevel = accessLevel
  auth.roles = roles
}

// A page LOAD (reload, bookmark): only a token in storage; nobody identified yet.
function coldLoad(roles: string[] | 'rejected') {
  tokenStorage.storeTokens({ accessToken: 'stored', refreshToken: '', expiresAt: Date.now() + 600_000 })
  if (roles === 'rejected') whoami.mockRejectedValue(new Error('401'))
  else whoami.mockResolvedValue({ user: 'someone@example.com', tenant: 'default', roles })
  useAuthStore().syncToken()
}

const BOUNCED = { path: '/files' }

beforeEach(() => {
  setActivePinia(createPinia())
  resetBootForTests()
  tokenStorage.clearTokens()
  whoami.mockReset()
})

describe('System (/admin/ops)', () => {
  it('opens for an administrator', () => {
    as('admin')
    expect(at('/admin/ops')).toBeUndefined()
  })

  it('opens for an extraction editor who is not an administrator', () => {
    as('user', ['users', 'extraction_editors'])
    expect(at('/admin/ops')).toBeUndefined()
  })

  it('matches the role case-insensitively, as LDAP cn values are not normalised', () => {
    as('user', ['Extraction_Editors'])
    expect(at('/admin/ops')).toBeUndefined()
  })

  it('stays closed to everyone else', () => {
    as('user', ['users', 'contributors'])
    expect(at('/admin/ops')).toEqual(BOUNCED)
  })
})

describe('the exception does not leak to other admin pages', () => {
  it.each(['/admin/tenant', '/admin/security', '/admin/shares'])('%s stays admin-only', (path) => {
    as('user', ['extraction_editors'])
    expect(at(path)).toEqual(BOUNCED)
  })
})

describe('a page load (reload, bookmark) waits for the identity', () => {
  // Previously the guard decided with empty roles, so reloading ANY admin page
  // bounced an administrator to /files.
  it('admits an administrator once whoami answers', async () => {
    coldLoad(['users', 'administrators'])
    expect(await at('/admin/ops')).toBeUndefined()
    expect(await at('/admin/tenant')).toBeUndefined()
  })

  it('admits an extraction editor to System, and only to System', async () => {
    coldLoad(['users', 'extraction_editors'])
    expect(await at('/admin/ops')).toBeUndefined()
    expect(await at('/admin/tenant')).toEqual(BOUNCED)
  })

  it('still keeps a plain member out', async () => {
    coldLoad(['users'])
    expect(await at('/admin/ops')).toEqual(BOUNCED)
  })

  it('sends a token the bridge rejects to sign in, not to /files', async () => {
    coldLoad('rejected')
    const r = await at('/admin/ops')
    expect(r).toMatchObject({ path: '/login' })
  })

  it('asks the bridge once however many guarded navigations wait', async () => {
    coldLoad(['users', 'administrators'])
    await Promise.all([at('/admin/ops'), at('/admin/tenant'), at('/admin/shares')])
    expect(whoami).toHaveBeenCalledTimes(1)
  })
})

describe('the old /prompt-sets address', () => {
  it('lands on the Prompt sets tab of System', async () => {
    // resolve() does not follow redirects; a real navigation does.
    as('admin')
    await router.push('/prompt-sets')
    expect(router.currentRoute.value.path).toBe('/admin/ops')
    expect(router.currentRoute.value.query.tab).toBe('prompt-sets')
  })
})

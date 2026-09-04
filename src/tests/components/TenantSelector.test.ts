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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Switching tenant must fully reset the app (KeepAlive views, stores, caches).
// We verify the component drives a clean boot rather than an in-app field swap.
const auth = { tenant: 'alpha', tenants: ['alpha', 'beta'], switchTenant: vi.fn() }
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

const { subdomainTenancyEnabled, tenantOrigin, reachable, ssoHandoff } = vi.hoisted(() => ({
  subdomainTenancyEnabled: vi.fn(),
  tenantOrigin: vi.fn(),
  reachable: vi.fn(),
  ssoHandoff: vi.fn(),
}))
vi.mock('@/utils/tenantHost', () => ({ subdomainTenancyEnabled, tenantOrigin }))
vi.mock('@/utils/tenantReach', () => ({
  tenantOriginReachable: reachable, forgetReachability: vi.fn(),
}))
vi.mock('@/utils/lastTenant', () => ({ rememberTenantFor: vi.fn() }))
vi.mock('@/services/authService', () => ({
  authService: { ssoHandoff }, default: { ssoHandoff },
}))

import TenantSelector from '@/components/TenantSelector.vue'

function stubLocation() {
  const reload = vi.fn()
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload, assign, hostname: 'localhost' },
  })
  return { reload, assign }
}

describe('TenantSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.tenant = 'alpha'
    reachable.mockResolvedValue(true)
    ssoHandoff.mockResolvedValue('one-time-code')
    tenantOrigin.mockReturnValue('https://beta.example.com')
  })

  it('single-domain: persists the tenant then hard-reloads for a clean reset', async () => {
    subdomainTenancyEnabled.mockReturnValue(false)
    const { reload, assign } = stubLocation()
    const w = mount(TenantSelector)
    await w.find('select').setValue('beta')
    await flushPromises()   // the handler is async now: it may probe before deciding
    expect(auth.switchTenant).toHaveBeenCalledWith('beta') // persists active tenant
    expect(reload).toHaveBeenCalledTimes(1) // full reset of stores + KeepAlive views
    expect(assign).not.toHaveBeenCalled()
  })

  it('subdomain: hands the SESSION to the tenant origin, not just the browser', async () => {
    // This used to assert a bare navigation to the tenant origin, described as
    // "authoritative". It was not — the token lives in localStorage, which is
    // origin-scoped, so the destination had no session and bounced the user to
    // the sign-in origin, which returned them to the tenant they had just left.
    // Switching therefore appeared to do nothing. The navigation must carry a
    // one-time hand-off code and land on /sso, which redeems it there.
    subdomainTenancyEnabled.mockReturnValue(true)
    const { reload, assign } = stubLocation()
    const w = mount(TenantSelector)
    await w.find('select').setValue('beta')
    await flushPromises()

    expect(ssoHandoff).toHaveBeenCalledWith('beta')
    const url = new URL(assign.mock.calls[0][0])
    expect(url.origin).toBe('https://beta.example.com')
    expect(url.pathname).toBe('/sso')
    expect(url.searchParams.get('code')).toBe('one-time-code')
    expect(auth.switchTenant).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('subdomain: falls back to an in-app switch when the origin is not serving', async () => {
    // Forwarding to a subdomain that is not actually running the app would
    // strand the user on a browser error page, outside anything we control.
    subdomainTenancyEnabled.mockReturnValue(true)
    reachable.mockResolvedValue(false)
    const { reload, assign } = stubLocation()
    const w = mount(TenantSelector)
    await w.find('select').setValue('beta')
    await flushPromises()

    expect(assign).not.toHaveBeenCalled()
    expect(auth.switchTenant).toHaveBeenCalledWith('beta')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when re-selecting the current tenant', async () => {
    subdomainTenancyEnabled.mockReturnValue(false)
    const { reload } = stubLocation()
    const w = mount(TenantSelector)
    await w.find('select').setValue('alpha')
    await flushPromises()
    expect(auth.switchTenant).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})

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
import { mount } from '@vue/test-utils'

// Switching tenant must fully reset the app (KeepAlive views, stores, caches).
// We verify the component drives a clean boot rather than an in-app field swap.
const auth = { tenant: 'alpha', tenants: ['alpha', 'beta'], switchTenant: vi.fn() }
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

const { subdomainTenancyEnabled, tenantUrl } = vi.hoisted(() => ({
  subdomainTenancyEnabled: vi.fn(),
  tenantUrl: vi.fn(),
}))
vi.mock('@/utils/tenantHost', () => ({ subdomainTenancyEnabled, tenantUrl }))

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
  })

  it('single-domain: persists the tenant then hard-reloads for a clean reset', async () => {
    subdomainTenancyEnabled.mockReturnValue(false)
    const { reload, assign } = stubLocation()
    const w = mount(TenantSelector)
    await w.find('select').setValue('beta')
    expect(auth.switchTenant).toHaveBeenCalledWith('beta') // persists active tenant
    expect(reload).toHaveBeenCalledTimes(1) // full reset of stores + KeepAlive views
    expect(assign).not.toHaveBeenCalled()
  })

  it('subdomain: navigates to the tenant origin (authoritative, no in-app swap)', async () => {
    subdomainTenancyEnabled.mockReturnValue(true)
    tenantUrl.mockReturnValue('https://beta.example.com/')
    const { reload, assign } = stubLocation()
    const w = mount(TenantSelector)
    await w.find('select').setValue('beta')
    expect(assign).toHaveBeenCalledWith('https://beta.example.com/')
    expect(auth.switchTenant).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('does nothing when re-selecting the current tenant', async () => {
    subdomainTenancyEnabled.mockReturnValue(false)
    const { reload } = stubLocation()
    const w = mount(TenantSelector)
    await w.find('select').setValue('alpha')
    expect(auth.switchTenant).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})

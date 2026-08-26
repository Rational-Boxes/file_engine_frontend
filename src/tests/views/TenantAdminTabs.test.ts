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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { listRoles } = vi.hoisted(() => ({ listRoles: vi.fn() }))

vi.mock('@/services/ldapAdminService', async () => {
  const actual = await vi.importActual<object>('@/services/ldapAdminService')
  return { ...actual, ldapAdminService: { listRoles } }
})

import TenantAdminView from '@/views/TenantAdminView.vue'

function mountView() {
  return mount(TenantAdminView, {
    global: {
      stubs: {
        AppNav: true,
        // Each policy editor loads its own data and has its own coverage; these
        // tests are about which tab shows which, not what the editors render.
        TwoFactorPolicyEditor: { template: '<div class="stub-2fa" />' },
        WebDavSessionTtlEditor: { template: '<div class="stub-webdav" />' },
      },
    },
  })
}

beforeEach(() => {
  listRoles.mockReset()
  listRoles.mockResolvedValue([])
})

describe('TenantAdminView tabs', () => {
  it('offers Users, Roles, Two-factor and WebDAV as separate tabs', async () => {
    const w = mountView()
    await flushPromises()
    const labels = w.findAll('.tabs button').map((b) => b.text())
    expect(labels).toEqual(['Users', 'Roles', 'Two-factor', 'WebDAV'])
  })

  it('opens on Users, with neither policy editor mounted', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('Invite a new user')
    expect(w.find('.stub-2fa').exists()).toBe(false)
    expect(w.find('.stub-webdav').exists()).toBe(false)
  })

  it('keeps the policy editors OFF the Roles tab', async () => {
    // They used to be appended to the bottom of Roles, where a tenant-wide
    // security setting read as an attribute of role membership.
    const w = mountView()
    await flushPromises()
    await w.findAll('.tabs button')[1].trigger('click')
    expect(w.text()).toContain('Create role')  // still the roles panel
    expect(w.find('.stub-2fa').exists()).toBe(false)
    expect(w.find('.stub-webdav').exists()).toBe(false)
  })

  it('shows only the two-factor editor on its own tab', async () => {
    const w = mountView()
    await flushPromises()
    await w.findAll('.tabs button')[2].trigger('click')
    expect(w.find('.stub-2fa').exists()).toBe(true)
    expect(w.find('.stub-webdav').exists()).toBe(false)
  })

  it('shows only the WebDAV editor on its own tab', async () => {
    const w = mountView()
    await flushPromises()
    await w.findAll('.tabs button')[3].trigger('click')
    expect(w.find('.stub-webdav').exists()).toBe(true)
    expect(w.find('.stub-2fa').exists()).toBe(false)
  })
})

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

const svc = vi.hoisted(() => ({
  listTenantUsers: vi.fn(),
  createUser: vi.fn(),
  getUserProfile: vi.fn(),
}))

vi.mock('@/services/ldapAdminService', async () => {
  const actual = await vi.importActual<object>('@/services/ldapAdminService')
  return { ...actual, ldapAdminService: svc }
})

import UserRoster from '@/components/admin/UserRoster.vue'

const ROLES = [
  { name: 'administrators', dn: 'cn=administrators', member_count: 1 },
  { name: 'editors', dn: 'cn=editors', member_count: 2 },
]

const ROSTER = [
  { uid: 'ann@x.test', email: 'ann@x.test', display_name: 'Ann Adams',
    roles: ['editors'], is_admin: false, orphaned: false },
  { uid: 'boss@x.test', email: 'boss@x.test', display_name: 'The Boss',
    roles: ['administrators'], is_admin: true, orphaned: false },
  { uid: 'ghost@x.test', email: 'ghost@x.test', display_name: '',
    roles: ['editors'], is_admin: false, orphaned: true },
]

function mountRoster() {
  return mount(UserRoster, {
    props: { roles: ROLES, selfUid: 'boss@x.test' },
    global: {
      stubs: {
        InviteUserModal: {
          name: 'InviteUserModal',
          props: ['open'],
          template: '<div class="stub-invite" />',
        },
        UserProfileModal: {
          name: 'UserProfileModal',
          props: ['uid'],
          template: '<div class="stub-modal">{{ uid }}</div>',
        },
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.listTenantUsers.mockResolvedValue(ROSTER)
})

describe('UserRoster', () => {
  it('lists every member of the tenant with the roles they hold', async () => {
    const w = mountRoster()
    await flushPromises()
    const rows = w.findAll('.ur-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('Ann Adams')
    expect(rows[0].text()).toContain('editors')
    expect(w.text()).toContain('3 people have access')
  })

  it('marks the signed-in admin so they know which row is theirs', async () => {
    const w = mountRoster()
    await flushPromises()
    const boss = w.findAll('.ur-row').find((r) => r.text().includes('The Boss'))!
    expect(boss.find('.ur-you').exists()).toBe(true)
    expect(boss.find('.ur-chip-admin').text()).toBe('administrators')
  })

  it('surfaces a role member whose account no longer exists', async () => {
    // Only an admin can clear these, so hiding them would strand them.
    const w = mountRoster()
    await flushPromises()
    const ghost = w.findAll('.ur-row').find((r) => r.text().includes('ghost@x.test'))!
    expect(ghost.find('.ur-chip-warn').exists()).toBe(true)
  })

  it('filters the roster it already holds, without calling the server', async () => {
    const w = mountRoster()
    await flushPromises()
    svc.listTenantUsers.mockClear()
    await w.find('.ur-filter').setValue('ann')
    expect(w.findAll('.ur-row')).toHaveLength(1)
    expect(svc.listTenantUsers).not.toHaveBeenCalled()
  })

  it('filters on role as well as name, so "who is an admin" is one keystroke', async () => {
    const w = mountRoster()
    await flushPromises()
    await w.find('.ur-filter').setValue('administrators')
    expect(w.findAll('.ur-row')).toHaveLength(1)
    expect(w.findAll('.ur-row')[0].text()).toContain('The Boss')
  })

  it('says so when a filter matches nobody', async () => {
    const w = mountRoster()
    await flushPromises()
    await w.find('.ur-filter').setValue('zzz')
    expect(w.text()).toContain('No one matches')
  })

  it('opens the profile modal for the clicked row', async () => {
    const w = mountRoster()
    await flushPromises()
    expect(w.find('.stub-modal').text()).toBe('')
    await w.findAll('.ur-row')[0].trigger('click')
    expect(w.find('.stub-modal').text()).toBe('ann@x.test')
  })

  it('keeps the invite form behind a button, not inline on the tab', async () => {
    const w = mountRoster()
    await flushPromises()
    expect(w.findComponent({ name: 'InviteUserModal' }).props('open')).toBe(false)
    await w.find('.ur-head-actions .ur-primary').trigger('click')
    expect(w.findComponent({ name: 'InviteUserModal' }).props('open')).toBe(true)
  })

  it('reports a sent invite and re-reads the roster', async () => {
    const w = mountRoster()
    await flushPromises()
    w.findComponent({ name: 'InviteUserModal' }).vm.$emit('invited', 'new@x.test')
    await flushPromises()
    expect(w.text()).toContain('Invited new@x.test')
    expect(svc.listTenantUsers).toHaveBeenCalledTimes(2)
    expect(w.emitted('roles-changed')).toBeTruthy()
  })

  it('shows the roster error instead of an empty list when the load fails', async () => {
    svc.listTenantUsers.mockRejectedValue(new Error('LDAP is unreachable'))
    const w = mountRoster()
    await flushPromises()
    expect(w.find('.ur-err').text()).toContain('LDAP is unreachable')
    expect(w.findAll('.ur-row')).toHaveLength(0)
  })

  it('drops a removed row immediately and re-reads the roster', async () => {
    const w = mountRoster()
    await flushPromises()
    svc.listTenantUsers.mockResolvedValue(ROSTER.filter((u) => u.uid !== 'ann@x.test'))
    w.findComponent({ name: 'UserProfileModal' }).vm.$emit('removed', 'ann@x.test')
    await flushPromises()
    expect(w.text()).not.toContain('Ann Adams')
    expect(w.text()).toContain('2 people have access')
  })

  it('tells the parent when membership changed, so role counts refresh', async () => {
    const w = mountRoster()
    await flushPromises()
    w.findComponent({ name: 'UserProfileModal' }).vm.$emit('changed')
    await flushPromises()
    expect(w.emitted('roles-changed')).toBeTruthy()
  })
})

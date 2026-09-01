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
//
// Both views are reachable by URL even with their nav entry hidden, so each has
// to answer for itself. The distinction a user needs is "this deployment does
// not have it" against "it is broken", and only the view knows which.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Two flushes: the first settles the capability promise, the second lets Vue
// re-render on the state it wrote.
const settle = async () => {
  await flushPromises()
  await flushPromises()
}

const { listTenant, revoke, revokeAllFor, load } = vi.hoisted(() => ({
  listTenant: vi.fn(), revoke: vi.fn(), revokeAllFor: vi.fn(), load: vi.fn(),
}))
vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  const svc = { listTenant, revoke, revokeAllFor }
  return { ...actual, shareService: svc, default: svc }
})
vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: { load, reset: vi.fn() },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: 'alice', tenant: 'default', accessLevel: 'admin', tenants: [], hasAccessLevel: () => true, logout: vi.fn() }),
}))
vi.mock('@/stores/help', () => ({ useHelpStore: () => ({ open: vi.fn() }) }))
vi.mock('@/components/security/AuditPanel.vue', () => ({ default: { name: 'AuditPanel', template: '<div class="audit-stub" />' } }))
vi.mock('@/components/security/SecurityRulesPanel.vue', () => ({ default: { name: 'SecurityRulesPanel', template: '<div class="rules-stub" />' } }))
vi.mock('@/components/security/EventsPanel.vue', () => ({ default: { name: 'EventsPanel', template: '<div class="events-stub" />' } }))
vi.mock('@/components/AppNav.vue', () => ({ default: { name: 'AppNav', template: '<nav />' } }))

import AdminSharesView from '@/views/AdminSharesView.vue'
import SecurityView from '@/views/SecurityView.vue'
import { resetCapabilities } from '@/composables/useCapabilities'

const caps = (over: Record<string, boolean> = {}) => {
  const on = (k: string) => ({ available: over[k] !== false })
  return {
    editing: { available: true, reason: '', extensions: [] },
    chat: on('chat'), webSearch: on('webSearch'), search: on('search'),
    discussion: on('discussion'), sharing: on('sharing'), difference: on('difference'),
    folderActions: on('folderActions'), bcf: on('bcf'), audit: on('audit'),
  }
}

const stubs = { RouterLink: true, HelpIcon: true }

describe('Shared outside — when sharing is not deployed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCapabilities()
    listTenant.mockResolvedValue({ links: [], truncated: false })
  })

  it('says the service is not there, and does not pretend nothing is shared', async () => {
    // "Nothing is shared outside this tenant" would be true and misleading — it
    // reads as a clean bill of health rather than a service that is absent.
    load.mockResolvedValue(caps({ sharing: false }))
    const w = mount(AdminSharesView, { global: { stubs } })
    await settle()
    expect(w.text()).toContain('does not run the sharing service')
    expect(w.text()).not.toContain('Nothing is shared outside this tenant')
    expect(w.find('.ash-filters').exists()).toBe(false)
  })

  it('shows the working queue where sharing is deployed', async () => {
    load.mockResolvedValue(caps())
    const w = mount(AdminSharesView, { global: { stubs } })
    await settle()
    expect(w.text()).not.toContain('does not run the sharing service')
    expect(w.find('.ash-filters').exists()).toBe(true)
  })
})

describe('Security — when the audit service is not deployed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCapabilities()
  })

  it('says so instead of mounting panels that cannot work', async () => {
    load.mockResolvedValue(caps({ audit: false }))
    const w = mount(SecurityView, { global: { stubs } })
    await settle()
    expect(w.text()).toContain('does not run the audit service')
    expect(w.find('.audit-stub').exists()).toBe(false)
    expect(w.find('.rules-stub').exists()).toBe(false)
  })

  it('shows the panels where the audit service is deployed', async () => {
    load.mockResolvedValue(caps())
    const w = mount(SecurityView, { global: { stubs } })
    await settle()
    expect(w.text()).not.toContain('does not run the audit service')
    expect(w.find('.audit-stub').exists()).toBe(true)
  })

  it('shows the panels while the deployment has not answered yet', async () => {
    load.mockReturnValue(new Promise(() => {}))
    const w = mount(SecurityView, { global: { stubs } })
    await settle()
    expect(w.find('.audit-stub').exists()).toBe(true)
  })
})

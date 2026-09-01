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
// The point of detecting a feature is that the interface stops offering it, so
// this asserts on the rendered nav rather than on the flags behind it.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: { load, reset: vi.fn() },
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: 'alice',
    tenant: 'default',
    accessLevel: 'admin',
    tenants: [],
    hasAccessLevel: () => true,
    logout: vi.fn(),
  }),
}))
vi.mock('@/stores/help', () => ({ useHelpStore: () => ({ open: vi.fn() }) }))

import AppNav from '@/components/AppNav.vue'
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

const mountNav = () =>
  mount(AppNav, {
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })

const hrefs = (w: ReturnType<typeof mountNav>) =>
  w.findAll('a').map((a) => a.attributes('href') ?? '')

describe('AppNav — offering only what the deployment has', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCapabilities()
  })

  it('offers everything on a fully-featured deployment', async () => {
    load.mockResolvedValue(caps())
    const w = mountNav()
    await flushPromises()
    const h = hrefs(w)
    expect(h).toContain('/search')
    expect(h).toContain('/chat')
    expect(h).toContain('/admin/security')
    expect(h).toContain('/admin/shares')
  })

  it('hides Search where no embedding model is configured', async () => {
    // Nothing was ever indexed, so the box would answer every query with
    // nothing and read as an empty library rather than a missing feature.
    load.mockResolvedValue(caps({ search: false }))
    const w = mountNav()
    await flushPromises()
    expect(hrefs(w)).not.toContain('/search')
    expect(hrefs(w)).toContain('/files')
  })

  it('hides the chat where no provider can be reached', async () => {
    load.mockResolvedValue(caps({ chat: false }))
    const w = mountNav()
    await flushPromises()
    expect(hrefs(w)).not.toContain('/chat')
  })

  it('hides Security where the audit service is absent', async () => {
    // Without it the route answered index.html with HTTP 200 and the panel died
    // reading undefined — a missing service disguised as a front-end error.
    load.mockResolvedValue(caps({ audit: false }))
    const w = mountNav()
    await flushPromises()
    expect(hrefs(w)).not.toContain('/admin/security')
    // Other admin destinations are unaffected.
    expect(hrefs(w)).toContain('/admin/tenant')
  })

  it('hides the outside-shares view where sharing is not deployed', async () => {
    load.mockResolvedValue(caps({ sharing: false }))
    const w = mountNav()
    await flushPromises()
    expect(hrefs(w)).not.toContain('/admin/shares')
  })

  it('offers everything while the deployment has not answered yet', async () => {
    load.mockReturnValue(new Promise(() => {}))  // never resolves
    const w = mountNav()
    await flushPromises()
    const h = hrefs(w)
    expect(h).toContain('/search')
    expect(h).toContain('/chat')
    expect(h).toContain('/admin/security')
  })
})

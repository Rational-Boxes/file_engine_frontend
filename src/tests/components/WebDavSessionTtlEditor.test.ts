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

const { getWebdavSessionTtl } = vi.hoisted(() => ({ getWebdavSessionTtl: vi.fn() }))

vi.mock('@/services/ldapAdminService', async () => {
  const actual = await vi.importActual<object>('@/services/ldapAdminService')
  return { ...actual, ldapAdminService: { getWebdavSessionTtl } }
})

import WebDavSessionTtlEditor from '@/components/WebDavSessionTtlEditor.vue'

const POLICY = {
  session_ttl_seconds: null,
  default_ttl_seconds: 43200,
  effective_ttl_seconds: 43200,
  min_ttl_seconds: 300,
  max_ttl_seconds: 86400,
}

beforeEach(() => {
  getWebdavSessionTtl.mockReset()
  getWebdavSessionTtl.mockResolvedValue(POLICY)
})

describe('WebDavSessionTtlEditor', () => {
  it('renders the policy once it loads', async () => {
    const w = mount(WebDavSessionTtlEditor)
    await flushPromises()
    expect(w.text()).toContain('WebDAV session lifetime')
    expect(w.find('input[type="checkbox"]').exists()).toBe(true)
  })

  it('says WHY it is empty when the policy cannot be loaded', async () => {
    // It used to be one v-if="ttl" around the whole template, so a failed load
    // rendered nothing at all — including the error message, which sat inside
    // the block its own failure switched off. Survivable at the foot of the
    // Roles tab; as a tab of its own it is a blank page claiming all is well.
    getWebdavSessionTtl.mockRejectedValue(new Error('gateway down'))
    const w = mount(WebDavSessionTtlEditor)
    await flushPromises()
    expect(w.find('.err').exists()).toBe(true)
    expect(w.text()).toContain('WebDAV session lifetime')
    expect(w.text()).not.toBe('')
  })

  it('does not offer controls it has no policy for', async () => {
    getWebdavSessionTtl.mockRejectedValue(new Error('gateway down'))
    const w = mount(WebDavSessionTtlEditor)
    await flushPromises()
    expect(w.find('input[type="checkbox"]').exists()).toBe(false)
    expect(w.find('button').exists()).toBe(false)
  })

  it('shows a loading state before the policy arrives', async () => {
    let release: (v: unknown) => void = () => {}
    getWebdavSessionTtl.mockReturnValue(new Promise((r) => { release = r }))
    const w = mount(WebDavSessionTtlEditor)
    await flushPromises()
    expect(w.text()).toContain('Loading')
    release(POLICY)
    await flushPromises()
    expect(w.text()).not.toContain('Loading')
  })
})

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

const { listTenant, revoke, revokeAllFor } = vi.hoisted(() => ({
  listTenant: vi.fn(), revoke: vi.fn(), revokeAllFor: vi.fn(),
}))

vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  const svc = { listTenant, revoke, revokeAllFor }
  return { ...actual, shareService: svc, default: svc }
})

import AdminSharesView from '@/views/AdminSharesView.vue'

function row(over: Record<string, unknown> = {}) {
  return {
    link_uid: 'l1', kind: 2, resource_uid: 'res-1', creator: 'alice',
    created_by: 'alice', created_at: '', expires_at: '2099-01-01T00:00:00Z',
    revoked_at: null, revoked_by: null, status: 'active',
    max_uses: 5, uses_consumed: 1, max_uses_per_recipient: 0, max_bytes: 0,
    bytes_consumed: 0, max_file_bytes: 0, max_files: 0, files_consumed: 0,
    pinned_version: null, follow_folder: false, include_subdirs: true,
    archive_bytes: null, note: null, recipient_count: 3, last_activity: null,
    resource_path: '/projects/acme/drawings', resource_depth: 3, ...over,
  }
}

function mountView() {
  return mount(AdminSharesView, {
    global: {
      stubs: {
        AppNav: { template: '<nav />' },
        RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot/></a>' },
      },
    },
  })
}

beforeEach(() => {
  listTenant.mockReset(); revoke.mockReset(); revokeAllFor.mockReset()
  listTenant.mockResolvedValue({ links: [row()], truncated: false })
  revoke.mockResolvedValue(undefined)
  revokeAllFor.mockResolvedValue(2)
})

describe('AdminSharesView', () => {
  it('opens on live links only — expired ones are noise', async () => {
    mountView()
    await flushPromises()
    expect(listTenant).toHaveBeenCalledWith(
      expect.objectContaining({ live: true, status: '' }))
  })

  it('shows who shared it, to how many, and where it sat', async () => {
    const w = mountView()
    await flushPromises()
    const t = w.text()
    expect(t).toContain('alice')
    expect(t).toContain('3')
    expect(t).toContain('drawings')
  })

  it('labels the path as a snapshot, not a current location', async () => {
    // It is captured at creation and goes stale on a move; implying otherwise
    // would send an admin looking in the wrong folder.
    const w = mountView()
    await flushPromises()
    expect(w.text()).toMatch(/at share time/i)
  })

  it('deep-links a folder share into the browser as a folder', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'RouterLink' }).props('to'))
      .toEqual({ path: '/files', query: { folder: 'res-1' } })
  })

  it('deep-links a file share as a file', async () => {
    listTenant.mockResolvedValue({ links: [row({ kind: 0 })], truncated: false })
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'RouterLink' }).props('to'))
      .toEqual({ path: '/files', query: { file: 'res-1' } })
  })

  it('turns a creator into the departed-employee query in one click', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('.ash-linkish').trigger('click')
    await flushPromises()
    expect(listTenant).toHaveBeenLastCalledWith(
      expect.objectContaining({ creator: 'alice' }))
  })

  it('separates the live scope from a status value', async () => {
    // The server takes them as different parameters; collapsing them here
    // would make "revoked" mean "live and revoked", which is never anything.
    const w = mountView()
    await flushPromises()
    await w.find('select').setValue('revoked')
    await flushPromises()
    expect(listTenant).toHaveBeenLastCalledWith(
      expect.objectContaining({ live: false, status: 'revoked' }))
  })

  it('requires a second click before revoking one link', async () => {
    const w = mountView()
    await flushPromises()
    const btn = () => w.findAll('button').find((b) => /Revoke|Confirm/.test(b.text()))!
    await btn().trigger('click')
    expect(revoke).not.toHaveBeenCalled()
    expect(btn().text()).toBe('Confirm')
    await btn().trigger('click')
    await flushPromises()
    expect(revoke).toHaveBeenCalledWith('l1')
  })

  it('does not bulk-revoke on the first click', async () => {
    // The bug this pins: bound straight to @click, a `confirmed = false`
    // parameter receives the PointerEvent — which is truthy, so the first
    // click would have revoked everything with no confirmation at all.
    const w = mountView()
    await flushPromises()
    await w.find('input[type="text"]').setValue('alice')
    await w.findAll('button').find((b) => b.text() === 'Apply')!.trigger('click')
    await flushPromises()

    const bulk = w.findAll('button').find((b) => /Revoke all/.test(b.text()))!
    await bulk.trigger('click')
    expect(revokeAllFor).not.toHaveBeenCalled()
    expect(w.text()).toMatch(/ends access for everyone/i)

    await w.findAll('button').find((b) => b.text() === 'Yes, revoke')!.trigger('click')
    await flushPromises()
    expect(revokeAllFor).toHaveBeenCalledWith('alice')
  })

  it('offers no bulk revoke until a creator is chosen', async () => {
    // "Revoke everything matching whatever is on screen" is too easy to fire
    // with a half-typed filter.
    const w = mountView()
    await flushPromises()
    expect(w.findAll('button').some((b) => /Revoke all/.test(b.text()))).toBe(false)
  })

  it('says plainly when a bulk revoke changed nothing', async () => {
    revokeAllFor.mockResolvedValue(0)
    const w = mountView()
    await flushPromises()
    await w.find('input[type="text"]').setValue('alice')
    await w.findAll('button').find((b) => b.text() === 'Apply')!.trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => /Revoke all/.test(b.text()))!.trigger('click')
    await w.findAll('button').find((b) => b.text() === 'Yes, revoke')!.trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/already closed/i)
  })

  it('distinguishes an empty tenant from empty filters', async () => {
    listTenant.mockResolvedValue({ links: [], truncated: false })
    const w = mountView()
    await flushPromises()
    expect(w.text()).toMatch(/nothing is shared outside/i)

    await w.find('input[type="text"]').setValue('nobody')
    await w.findAll('button').find((b) => b.text() === 'Apply')!.trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/nothing matches those filters/i)
  })

  it('carries the caveat that revoking is not a recall', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).toMatch(/does not un-send/i)
  })

  it('surfaces a 403 rather than rendering an empty table', async () => {
    // A non-admin hand-typing the URL must see the refusal. An empty table
    // would read as "nothing is shared here", the worst possible answer.
    listTenant.mockRejectedValue(new Error('forbidden'))
    const w = mountView()
    await flushPromises()
    expect(w.find('.ash-err').exists()).toBe(true)
    expect(w.find('table').exists()).toBe(false)
  })

  it('offers no revoke button on an already-revoked link', async () => {
    listTenant.mockResolvedValue({ links: [row({ status: 'revoked' })], truncated: false })
    const w = mountView()
    await flushPromises()
    expect(w.findAll('button').some((b) => b.text() === 'Revoke')).toBe(false)
  })
})

describe('AdminSharesView truncation', () => {
  it('never hides that the list was capped', async () => {
    // An admin who closes a review believing they saw everything is the exact
    // failure this console exists to prevent.
    listTenant.mockResolvedValue({ links: [row()], truncated: true })
    const w = mountView()
    await flushPromises()
    expect(w.find('.ash-trunc').exists()).toBe(true)
    expect(w.text()).toMatch(/there are more/i)
  })

  it('says nothing about capping when the list is complete', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.ash-trunc').exists()).toBe(false)
  })
})

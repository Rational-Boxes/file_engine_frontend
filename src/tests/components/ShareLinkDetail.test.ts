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

const { recipients, redemptions, addRecipient, removeRecipient } = vi.hoisted(() => ({
  recipients: vi.fn(), redemptions: vi.fn(),
  addRecipient: vi.fn(), removeRecipient: vi.fn(),
}))

vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  const svc = { recipients, redemptions, addRecipient, removeRecipient }
  return { ...actual, shareService: svc, default: svc }
})

import ShareLinkDetail from '@/components/ShareLinkDetail.vue'

function recipient(over: Record<string, unknown> = {}) {
  return {
    email: 'priya@example.com', invited_at: '', invited_by: 'alice',
    last_code_sent_at: null, first_verified_at: null, last_used_at: null,
    uses_consumed: 0, failed_codes: 0, removed_at: null, removed_by: null,
    status: 'on_the_list', ...over,
  }
}

function redemption(over: Record<string, unknown> = {}) {
  return {
    redemption_uid: 'r1', opened_at: new Date().toISOString(), completed_at: null,
    verified_email: 'priya@example.com', source_addr: '203.0.113.7',
    user_agent: null, bytes_moved: 0, files_moved: 0, result_uid: null,
    archive_bytes: null, members_served: 0, ...over,
  }
}

function mountDetail() {
  return mount(ShareLinkDetail, {
    props: { linkUid: 'l1' },
    global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } },
  })
}

beforeEach(() => {
  recipients.mockReset(); redemptions.mockReset()
  addRecipient.mockReset(); removeRecipient.mockReset()
  recipients.mockResolvedValue([]); redemptions.mockResolvedValue([])
})

describe('ShareLinkDetail', () => {
  it('does not claim a recipient was contacted — v1 sends no invite', async () => {
    // "Invited" would be a lie: the system mailed nobody and knows nothing
    // about whether they received anything.
    recipients.mockResolvedValue([recipient()])
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).toContain('On the list')
    expect(w.text()).not.toMatch(/\bInvited\b/)
  })

  it('describes an opened link as evidence, not proof', async () => {
    // Anyone holding the URL can request a code for a listed address, so this
    // must not assert that the recipient personally opened anything.
    recipients.mockResolvedValue([recipient({ last_code_sent_at: new Date().toISOString() })])
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).toMatch(/a code was requested/i)
  })

  it('walks the status ladder to its furthest rung', async () => {
    recipients.mockResolvedValue([
      recipient({ email: 'a@x.com', last_code_sent_at: '2026-01-01T00:00:00Z' }),
      recipient({ email: 'b@x.com', first_verified_at: '2026-01-01T00:00:00Z' }),
      recipient({ email: 'c@x.com', last_used_at: '2026-01-01T00:00:00Z', uses_consumed: 3 }),
      recipient({ email: 'd@x.com', removed_at: '2026-01-01T00:00:00Z' }),
    ])
    const w = mountDetail()
    await flushPromises()
    const t = w.text()
    expect(t).toMatch(/a code was requested/i)
    expect(t).toContain('Verified')
    expect(t).toContain('Used 3×')
    expect(t).toContain('Removed')
  })

  it('flags an address whose codes keep failing', async () => {
    recipients.mockResolvedValue([recipient({ failed_codes: 5 })])
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).toMatch(/code attempts failing/i)
  })

  it('says nobody has used the link rather than showing an empty list', async () => {
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).toMatch(/nobody has used this link yet/i)
  })

  it('shows who used it, when, and from where', async () => {
    redemptions.mockResolvedValue([redemption({ bytes_moved: 2_500_000 })])
    const w = mountDetail()
    await flushPromises()
    const t = w.text()
    expect(t).toContain('priya@example.com')
    expect(t).toContain('203.0.113.7')
    expect(t).toMatch(/2\.4 MB/)
  })

  it('links a drop straight to the file it created', async () => {
    // "What did they send us" should be one click, not a hunt through the folder.
    redemptions.mockResolvedValue([redemption({ files_moved: 2, result_uid: 'file-9' })])
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).toContain('2 files')
    expect(w.find('.sld-link').exists()).toBe(true)
  })

  it('adds an address, lower-cased, and reloads', async () => {
    const w = mountDetail()
    await flushPromises()
    await w.find('input[type="email"]').setValue('  NEW@Example.com ')
    await w.findAll('button').find((b) => b.text() === 'Add')!.trigger('click')
    await flushPromises()
    expect(addRecipient).toHaveBeenCalledWith('l1', 'new@example.com')
    expect(recipients).toHaveBeenCalledTimes(2)
  })

  it('removes an address as a partial revoke', async () => {
    recipients.mockResolvedValue([recipient()])
    const w = mountDetail()
    await flushPromises()
    await w.findAll('button').find((b) => b.text() === 'Remove')!.trigger('click')
    await flushPromises()
    expect(removeRecipient).toHaveBeenCalledWith('l1', 'priya@example.com')
  })

  it('offers no Remove on an address already removed', async () => {
    recipients.mockResolvedValue([recipient({ removed_at: '2026-01-01T00:00:00Z' })])
    const w = mountDetail()
    await flushPromises()
    expect(w.findAll('button').some((b) => b.text() === 'Remove')).toBe(false)
  })

  it('surfaces a load failure instead of rendering a blank panel', async () => {
    redemptions.mockRejectedValue(new Error('nope'))
    const w = mountDetail()
    await flushPromises()
    expect(w.find('.sld-err').exists()).toBe(true)
  })
})

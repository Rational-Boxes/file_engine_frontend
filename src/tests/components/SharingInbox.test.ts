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

const { inbox } = vi.hoisted(() => ({ inbox: vi.fn() }))
vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  const svc = { inbox }
  return { ...actual, shareService: svc, default: svc }
})

import SharingInbox from '@/components/SharingInbox.vue'

function link(over: Record<string, unknown> = {}) {
  return {
    link_uid: 'l1', kind: 2, resource_uid: 'res-1', created_by: 'alice',
    created_at: '',
    // A margin past the boundary: "time left" floors, so exactly 3 days renders
    // as 2d. Flooring is correct — never overstate an expiry.
    expires_at: new Date(Date.now() + 3 * 86400000 + 60000).toISOString(),
    revoked_at: null, revoked_by: null, status: 'active', max_uses: 5,
    uses_consumed: 2, max_uses_per_recipient: 0, max_bytes: 0, bytes_consumed: 0,
    max_file_bytes: 0, max_files: 0, files_consumed: 0, pinned_version: null,
    follow_folder: false, include_subdirs: true, archive_bytes: null,
    note: 'Q3 drawings', recipient_count: 2, ...over,
  }
}

function mountInbox() {
  return mount(SharingInbox, {
    global: {
      stubs: { RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot/></a>' } },
    },
  })
}

beforeEach(() => {
  inbox.mockReset()
  inbox.mockResolvedValue({ needsAttention: [], dropBoxes: [], active: [] })
})

describe('SharingInbox', () => {
  it('renders nothing at all when the user shares nothing', async () => {
    // Most users never share. An empty "Sharing" heading is dashboard noise.
    const w = mountInbox()
    await flushPromises()
    expect(w.find('.si').exists()).toBe(false)
  })

  it('stays silent when sharing is switched off for the deployment', async () => {
    // That is a 404, not a fault worth reporting to someone who did not ask.
    inbox.mockRejectedValue(new Error('404'))
    const w = mountInbox()
    await flushPromises()
    expect(w.find('.si').exists()).toBe(false)
  })

  it('omits the Needs attention heading when nothing is wrong', async () => {
    // Empty most days, and that emptiness is the point.
    inbox.mockResolvedValue({ needsAttention: [], dropBoxes: [], active: [link()] })
    const w = mountInbox()
    await flushPromises()
    expect(w.text()).not.toMatch(/needs attention/i)
    expect(w.text()).toMatch(/active links/i)
  })

  it('leads with what is wrong and says why', async () => {
    inbox.mockResolvedValue({
      needsAttention: [link({
        status: 'not_working',
        not_working_message: 'You no longer have access to this item.',
      })],
      dropBoxes: [], active: [],
    })
    const w = mountInbox()
    await flushPromises()
    expect(w.text()).toMatch(/needs attention/i)
    expect(w.text()).toContain('You no longer have access')
  })

  it('describes a drop box by what has landed, not by budget left', async () => {
    // A drop box is a thing you are WAITING ON — the one share shape with an
    // inbox character.
    inbox.mockResolvedValue({
      needsAttention: [],
      dropBoxes: [link({ kind: 1, max_files: 5, files_consumed: 3, recipient_count: 1 })],
      active: [],
    })
    const w = mountInbox()
    await flushPromises()
    expect(w.text()).toContain('3 of 5 files')
    expect(w.text()).toContain('1 sender')
  })

  it('shows an active link with its usage and time left', async () => {
    inbox.mockResolvedValue({ needsAttention: [], dropBoxes: [], active: [link()] })
    const w = mountInbox()
    await flushPromises()
    expect(w.text()).toContain('2 / 5 used')
    expect(w.text()).toContain('3d left')
  })

  it('names a link by its note, falling back to its shape', async () => {
    inbox.mockResolvedValue({
      needsAttention: [], dropBoxes: [],
      active: [link({ note: null }), link({ link_uid: 'l2', note: 'Contract' })],
    })
    const w = mountInbox()
    await flushPromises()
    expect(w.text()).toContain('Shared folder')
    expect(w.text()).toContain('Contract')
  })

  it('deep-links every row to the Share tab', async () => {
    inbox.mockResolvedValue({ needsAttention: [], dropBoxes: [], active: [link()] })
    const w = mountInbox()
    await flushPromises()
    expect(w.findComponent({ name: 'RouterLink' }).props('to'))
      .toEqual({ path: '/files', query: { folder: 'res-1', tab: 'share' } })
  })

  it('deep-links a file share as a file', async () => {
    inbox.mockResolvedValue({
      needsAttention: [], dropBoxes: [], active: [link({ kind: 0 })],
    })
    const w = mountInbox()
    await flushPromises()
    expect(w.findComponent({ name: 'RouterLink' }).props('to'))
      .toEqual({ path: '/files', query: { file: 'res-1', tab: 'share' } })
  })

  // Owner's request 2026-10-04: video shares belong on the Dashboard beside the
  // regular ones, with their information — who has watched — not as an
  // anonymous "Shared file · 0 used" that clicked through to a folder that
  // does not exist.
  it('shows a video share by its title, with who has watched', async () => {
    inbox.mockResolvedValue({ needsAttention: [], dropBoxes: [], active: [
      link({ link_uid: 'f1', kind: 0, note: 'Contract' }),
      link({ link_uid: 'm1', kind: 3, note: null, display_name: 'Intro video', max_uses: 0,
             uses_consumed: 0, media_state: 'ready',
             audience: { viewers: 3, watched: 2, completed: 1, last_seen_at: '2026-10-04T23:00:00Z' } }),
    ] })
    const w = mountInbox()
    await flushPromises()
    const rows = w.findAll('.si-row')
    expect(rows).toHaveLength(2)                                   // beside the regular share
    expect(rows[1].text()).toMatch(/▶ Intro video/)
    expect(rows[1].get('[data-test="media-summary"]').text()).toMatch(/^3 viewers · 1 finished · 3d left$/)
    expect(rows[1].text()).not.toMatch(/used/)
    expect(rows[0].text()).toMatch(/2 \/ 5 used/)                 // the file share is unchanged
  })

  it('a video share nobody has watched says so, and a preparing one says that', async () => {
    inbox.mockResolvedValue({ needsAttention: [], dropBoxes: [], active: [
      link({ kind: 3, note: null, display_name: 'Demo', media_state: 'pending_media', max_uses: 0,
             uses_consumed: 0, audience: { viewers: 0, watched: 0, completed: 0, last_seen_at: null } }),
    ] })
    const w = mountInbox()
    await flushPromises()
    expect(w.text()).toMatch(/Preparing/)
    expect(w.get('[data-test="media-summary"]').text()).toMatch(/^Not watched yet/)
  })

  it("a video share opens the video's own Share tab, not a folder", async () => {
    inbox.mockResolvedValue({ needsAttention: [], dropBoxes: [], active: [
      link({ kind: 3, resource_uid: 'video-1', display_name: 'Demo' }),
    ] })
    const w = mountInbox()
    await flushPromises()
    expect(w.findComponent({ name: 'RouterLink' }).props('to'))
      .toEqual({ path: '/files', query: { file: 'video-1', tab: 'share' } })
  })
})

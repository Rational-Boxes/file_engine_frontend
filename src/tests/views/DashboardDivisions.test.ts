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
import { createPinia, setActivePinia } from 'pinia'

const { attention, activity, markSeen } = vi.hoisted(() => ({
  attention: vi.fn(), activity: vi.fn(), markSeen: vi.fn(),
}))

vi.mock('@/services/discussionService', async () => {
  const actual = await vi.importActual<object>('@/services/discussionService')
  const svc = { attention, activity, markSeen }
  return { ...actual, discussionService: svc, default: svc }
})

const { inbox } = vi.hoisted(() => ({ inbox: vi.fn() }))
vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  const svc = { inbox }
  return { ...actual, shareService: svc, default: svc }
})

import DashboardView from '@/views/DashboardView.vue'

function note(over: Record<string, unknown> = {}) {
  return {
    id: 1, kind: 'mention', fileUid: 'f1', threadId: 't1', reviewId: null,
    actor: 'carol', createdAt: new Date().toISOString(), readAt: null,
    source: 'comments', shareLinkUid: null, detailText: null, ...over,
  }
}

function mountDash() {
  setActivePinia(createPinia())
  return mount(DashboardView, {
    global: {
      stubs: {
        AppNav: { template: '<nav />' },
        ReviewsInbox: { template: '<div />' },
        SharingInbox: { template: '<div />' },
        RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot/></a>' },
      },
    },
  })
}

beforeEach(() => {
  attention.mockReset(); activity.mockReset(); markSeen.mockReset(); inbox.mockReset()
  attention.mockResolvedValue([])
  activity.mockResolvedValue([])
  markSeen.mockResolvedValue(undefined)
  inbox.mockResolvedValue({ needsAttention: [], dropBoxes: [], active: [] })
})

describe('Dashboard attention divisions', () => {
  it('groups the feed by originating system', async () => {
    attention.mockResolvedValue([
      note({ id: 1, kind: 'mention', source: 'comments' }),
      note({ id: 2, kind: 'review_requested', source: 'reviews' }),
      note({ id: 3, kind: 'share_drop_received', source: 'sharing',
             shareLinkUid: 'l1', detailText: 'bob sent plans.pdf' }),
    ])
    const w = mountDash()
    await flushPromises()
    const headings = w.findAll('.division').map((h) => h.text())
    expect(headings.some((h) => h.includes('Comments'))).toBe(true)
    expect(headings.some((h) => h.includes('Reviews'))).toBe(true)
    expect(headings.some((h) => h.includes('Sharing'))).toBe(true)
  })

  it('keeps the divisions in a fixed order so the feed does not reshuffle', async () => {
    attention.mockResolvedValue([
      note({ id: 1, kind: 'share_drop_received', source: 'sharing', shareLinkUid: 'l1' }),
      note({ id: 2, kind: 'mention', source: 'comments' }),
    ])
    const w = mountDash()
    await flushPromises()
    const headings = w.findAll('.division').map((h) => h.text())
    // Sharing arrived first in the payload; the order is Comments · Reviews · Sharing.
    expect(headings.findIndex((h) => h.includes('Comments')))
      .toBeLessThan(headings.findIndex((h) => h.includes('Sharing')))
  })

  it('omits empty divisions entirely', async () => {
    attention.mockResolvedValue([note({ source: 'comments' })])
    const w = mountDash()
    await flushPromises()
    const headings = w.findAll('.division').map((h) => h.text())
    expect(headings).toHaveLength(1)
    expect(headings[0]).toContain('Comments')
  })

  it('gives an unrecognised source its own heading rather than dropping it', async () => {
    // A source the SPA has never heard of must degrade VISIBLY — the whole
    // reason `source` is mapped server-side rather than guessed here.
    attention.mockResolvedValue([note({ id: 7, kind: 'brand_new', source: 'workflow' })])
    const w = mountDash()
    await flushPromises()
    expect(w.findAll('.division').map((h) => h.text()).join()).toContain('workflow')
    expect(w.text()).toContain('brand_new')
  })

  it('counts unread per division while the badge stays the total', async () => {
    attention.mockResolvedValue([
      note({ id: 1, source: 'comments', readAt: null }),
      note({ id: 2, source: 'comments', readAt: null }),
      note({ id: 3, kind: 'share_link_dead', source: 'sharing', readAt: null,
             shareLinkUid: 'l1' }),
    ])
    const w = mountDash()
    await flushPromises()
    const comments = w.findAll('.division').find((h) => h.text().includes('Comments'))!
    expect(comments.text()).toContain('2')
    // "One place to look" is unchanged: the top badge is still everything.
    expect(w.find('h2 .badge').text()).toBe('3')
  })

  it('renders a share row from its own text, not the actor', async () => {
    // The row must be readable without resolving the resource — "your link
    // stopped working" usually means the user can no longer read it.
    attention.mockResolvedValue([
      note({ id: 4, kind: 'share_link_dead', source: 'sharing',
             actor: 'system:share', shareLinkUid: 'l1',
             detailText: 'Q3 drawings' }),
    ])
    const w = mountDash()
    await flushPromises()
    expect(w.text()).toContain('Q3 drawings')
    expect(w.text()).not.toContain('system:share')
  })

  it('deep-links a share item to the Share tab, never a preview route', async () => {
    // /preview/{uid} does not exist for a folder at all, which is what a
    // folder-download link points at.
    attention.mockResolvedValue([
      note({ id: 5, kind: 'share_drop_received', source: 'sharing',
             shareLinkUid: 'l1', fileUid: 'folder-9', detailText: 'a file arrived' }),
    ])
    const w = mountDash()
    await flushPromises()
    const to = w.findComponent({ name: 'RouterLink' }).props('to')
    expect(to).toEqual({ path: '/files', query: { folder: 'folder-9', tab: 'share' } })
  })

  it('still deep-links a comment item to its thread', async () => {
    // Guard on the guard: the share branch must not have changed the old path.
    attention.mockResolvedValue([note({ id: 6, threadId: 't9', fileUid: 'f9' })])
    const w = mountDash()
    await flushPromises()
    const to = w.findComponent({ name: 'RouterLink' }).props('to')
    expect(to).toEqual({ path: '/preview/f9', query: { thread: 't9' } })
  })
})

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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/services/discussionService', () => ({
  discussionService: { attention: vi.fn(), activity: vi.fn(), markSeen: vi.fn() },
}))
import { discussionService } from '@/services/discussionService'
import { useDiscussionStore, collapseNewFileActivity } from '@/stores/discussion'

const act = (
  id: number,
  eventType: string,
  fileUid: string,
  ts: string,
) => ({ id, fileUid, eventType, version: '', name: 'doc', path: '/doc', actor: 'a', ts })

const notif = (id: number, readAt: string | null = null) => ({
  id, kind: 'mention', fileUid: 'f1', threadId: 't1', reviewId: null, actor: 'carol',
  createdAt: 'x', readAt,
})

describe('discussion store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    ;(discussionService.attention as ReturnType<typeof vi.fn>).mockResolvedValue([notif(1), notif(2, 'seen')])
    ;(discussionService.activity as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('refresh loads both feeds and computes unreadCount', async () => {
    const s = useDiscussionStore()
    await s.refresh()
    expect(s.attention.length).toBe(2)
    expect(s.unreadCount).toBe(1) // one has readAt
  })

  it('markSeen flips readAt when the server confirms', async () => {
    ;(discussionService.markSeen as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    const s = useDiscussionStore()
    await s.refresh()
    await s.markSeen(1)
    expect(s.attention.find((n) => n.id === 1)!.readAt).not.toBeNull()
    expect(s.unreadCount).toBe(0)
  })

  it('startPolling refreshes immediately then on the interval', async () => {
    const s = useDiscussionStore()
    s.startPolling()
    await flushPromises()
    expect(discussionService.attention).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30000)
    await flushPromises()
    expect(discussionService.attention).toHaveBeenCalledTimes(2)
    s.stopPolling()
    vi.advanceTimersByTime(30000)
    await flushPromises()
    expect(discussionService.attention).toHaveBeenCalledTimes(2) // stopped
  })

  it('degrades quietly on error', async () => {
    ;(discussionService.attention as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'))
    const s = useDiscussionStore()
    await s.refresh()
    expect(s.error).toBeTruthy()
    expect(s.loading).toBe(false)
  })

  it('activityFeed collapses each new file\'s touch+put into a single "created"', async () => {
    ;(discussionService.activity as ReturnType<typeof vi.fn>).mockResolvedValue([
      act(2, 'updated', 'f1', '2026-07-08T10:00:03Z'), // put (3s after touch)
      act(1, 'created', 'f1', '2026-07-08T10:00:00Z'), // touch
    ])
    const s = useDiscussionStore()
    await s.refresh()
    expect(s.activity.length).toBe(2) // raw feed untouched
    const feed = s.activityFeed
    expect(feed.length).toBe(1)
    expect(feed[0].eventType).toBe('created')
    expect(feed[0].fileUid).toBe('f1')
  })
})

describe('collapseNewFileActivity', () => {
  it('keeps a genuine later update (outside the window)', () => {
    const out = collapseNewFileActivity([
      act(2, 'updated', 'f1', '2026-07-08T10:10:00Z'), // 10 min later — a real edit
      act(1, 'created', 'f1', '2026-07-08T10:00:00Z'),
    ])
    expect(out.map((a) => a.eventType).sort()).toEqual(['created', 'updated'])
  })

  it('keeps an update with no matching create (edit of an existing file)', () => {
    const out = collapseNewFileActivity([act(9, 'updated', 'f2', '2026-07-08T10:00:00Z')])
    expect(out).toHaveLength(1)
  })

  it('leaves other event types alone', () => {
    const rows = [
      act(1, 'created', 'a', '2026-07-08T10:00:00Z'),
      act(2, 'restored', 'b', '2026-07-08T10:00:01Z'),
    ]
    expect(collapseNewFileActivity(rows)).toHaveLength(2)
  })
})

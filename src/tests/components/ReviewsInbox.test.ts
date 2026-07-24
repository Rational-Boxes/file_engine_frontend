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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const svc = vi.hoisted(() => ({
  listReviews: vi.fn(),
  acknowledgeReview: vi.fn(),
  completeReview: vi.fn(),
}))
vi.mock('@/services/discussionService', () => ({ discussionService: svc }))
// Stub router-link so the component mounts without a router.
const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }

import ReviewsInbox from '@/components/ReviewsInbox.vue'

const review = (over: Record<string, unknown> = {}) => ({
  id: 'r1', fileUid: 'f1abcdef123', version: '', threadId: null, requester: 'bob',
  reviewer: 'carol', status: 'requested', outcome: null, createdAt: 'x',
  acknowledgedAt: null, completedAt: null, ...over,
})

const mountInbox = () =>
  mount(ReviewsInbox, { global: { stubs: { RouterLink: RouterLinkStub } } })

describe('ReviewsInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows reviews awaiting the caller with actions', async () => {
    svc.listReviews.mockImplementation((role: string) =>
      Promise.resolve(role === 'reviewer' ? [review()] : []))
    const w = mountInbox()
    await flushPromises()
    expect(w.text()).toContain('Awaiting your review')
    expect(w.find('button').exists()).toBe(true)
  })

  it('acknowledge calls the service then reloads', async () => {
    svc.listReviews.mockImplementation((role: string) =>
      Promise.resolve(role === 'reviewer' ? [review()] : []))
    svc.acknowledgeReview.mockResolvedValue(review({ status: 'acknowledged' }))
    const w = mountInbox()
    await flushPromises()
    const ack = w.findAll('button').find((b) => b.text() === 'Acknowledge')!
    await ack.trigger('click')
    await flushPromises()
    expect(svc.acknowledgeReview).toHaveBeenCalledWith('r1')
    expect(svc.listReviews).toHaveBeenCalledTimes(4) // 2 on mount + 2 on reload
  })

  it('empty state when there are no reviews', async () => {
    svc.listReviews.mockResolvedValue([])
    const w = mountInbox()
    await flushPromises()
    expect(w.text()).toContain('No open reviews.')
  })
})

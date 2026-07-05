import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/services/discussionService', () => ({
  discussionService: { attention: vi.fn(), activity: vi.fn(), markSeen: vi.fn() },
}))
import { discussionService } from '@/services/discussionService'
import { useDiscussionStore } from '@/stores/discussion'

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
})

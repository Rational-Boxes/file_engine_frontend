import { describe, it, expect, vi, beforeEach } from 'vitest'

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('@/services/discussionClient', () => ({ default: client, liveSocketUrl: vi.fn() }))

import { discussionService } from '@/services/discussionService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('discussionService', () => {
  it('listThreads maps snake_case → camelCase (incl. comments)', async () => {
    client.get.mockResolvedValue({
      data: {
        threads: [{
          id: 't1', file_uid: 'f1', opened_by: 'bob', status: 'open', version: '',
          created_at: 'x', updated_at: 'x', anchor_stale: true, resolved_by: null,
          resolved_version: null, title: 'Q',
          comments: [{ id: 'c1', thread_id: 't1', author: 'bob', body: 'hi', created_at: 'x',
                       edited_at: null, deleted: false, redacted: false }],
        }],
      },
    })
    const threads = await discussionService.listThreads('f1')
    expect(client.get).toHaveBeenCalledWith('/files/f1/threads', { params: {} })
    expect(threads[0].fileUid).toBe('f1')
    expect(threads[0].openedBy).toBe('bob')
    expect(threads[0].anchorStale).toBe(true)
    expect(threads[0].comments![0].threadId).toBe('t1')
  })

  it('reply posts body + mentions and maps the comment', async () => {
    client.post.mockResolvedValue({
      data: { id: 'c2', thread_id: 't1', author: 'carol', body: 'yo', created_at: 'x',
              edited_at: null, deleted: false, redacted: false },
    })
    const c = await discussionService.reply('t1', 'yo', { mentions: ['dave@x'], parentCommentId: 'p1' })
    expect(client.post).toHaveBeenCalledWith('/threads/t1/comments',
      { body: 'yo', mentions: ['dave@x'], parent_comment_id: 'p1' })
    expect(c.author).toBe('carol')
  })

  it('flags posts file_uids and returns the map', async () => {
    client.post.mockResolvedValue({ data: { flags: { f1: { mentions: 2, reviews: 1 } } } })
    const flags = await discussionService.flags(['f1', 'f2'])
    expect(client.post).toHaveBeenCalledWith('/attention/flags', { file_uids: ['f1', 'f2'] })
    expect(flags.f1).toEqual({ mentions: 2, reviews: 1 })
  })

  it('flags short-circuits with no uids (no request)', async () => {
    expect(await discussionService.flags([])).toEqual({})
    expect(client.post).not.toHaveBeenCalled()
  })

  it('attention maps notification items', async () => {
    client.get.mockResolvedValue({
      data: { items: [{ id: 7, kind: 'mention', file_uid: 'f1', thread_id: 't1', review_id: null,
                        actor: 'carol', created_at: 'x', read_at: null }] },
    })
    const items = await discussionService.attention({ unread: true })
    expect(client.get).toHaveBeenCalledWith('/dashboard/attention', { params: { unread: true } })
    expect(items[0].fileUid).toBe('f1')
    expect(items[0].readAt).toBeNull()
  })

  it('raiseReview posts reviewers and maps the result', async () => {
    client.post.mockResolvedValue({
      data: { reviews: [{ id: 'r1', file_uid: 'f1', requester: 'bob', reviewer: 'carol',
                          status: 'requested', version: '', thread_id: null, outcome: null,
                          created_at: 'x', acknowledged_at: null, completed_at: null }] },
    })
    const rs = await discussionService.raiseReview('f1', ['carol@x'], { version: 'v1' })
    expect(client.post).toHaveBeenCalledWith('/files/f1/reviews',
      { reviewers: ['carol@x'], version: 'v1', thread_id: undefined })
    expect(rs[0].reviewer).toBe('carol')
  })

  it('acknowledgeReview + completeReview post to the right routes', async () => {
    client.post.mockResolvedValue({
      data: { id: 'r1', file_uid: 'f1', requester: 'bob', reviewer: 'carol', status: 'acknowledged',
              version: '', thread_id: null, outcome: null, created_at: 'x',
              acknowledged_at: 'y', completed_at: null },
    })
    const r = await discussionService.acknowledgeReview('r1')
    expect(client.post).toHaveBeenCalledWith('/reviews/r1/acknowledge')
    expect(r.status).toBe('acknowledged')

    await discussionService.completeReview('r1', 'approved')
    expect(client.post).toHaveBeenCalledWith('/reviews/r1/complete', { outcome: 'approved' })
  })

  it('listReviews forwards role + status', async () => {
    client.get.mockResolvedValue({ data: { reviews: [] } })
    await discussionService.listReviews('reviewer', 'requested')
    expect(client.get).toHaveBeenCalledWith('/reviews', { params: { role: 'reviewer', status: 'requested' } })
  })

  it('setThreadStatus sends resolved_version', async () => {
    client.patch.mockResolvedValue({ data: { id: 't1', file_uid: 'f1', opened_by: 'bob',
      status: 'resolved', created_at: 'x', updated_at: 'x', anchor_stale: false,
      resolved_by: 'bob', resolved_version: 'v2', version: '', title: '' } })
    const t = await discussionService.setThreadStatus('t1', 'resolved', 'v2')
    expect(client.patch).toHaveBeenCalledWith('/threads/t1', { status: 'resolved', resolved_version: 'v2' })
    expect(t.resolvedVersion).toBe('v2')
  })

  it('openThread forwards a model-viewpoint anchor and maps it back (§9)', async () => {
    const anchor = {
      kind: 'model-viewpoint' as const,
      schema: 'fileengine.anchor.v1',
      viewpoint: { perspective_camera: {} },
      object_refs: [],
    }
    client.post.mockResolvedValue({
      data: { id: 't9', file_uid: 'f1', opened_by: 'bob', anchor },
    })
    const t = await discussionService.openThread('f1', { body: 'see this clash', anchor })
    expect(client.post).toHaveBeenCalledWith('/files/f1/threads', { body: 'see this clash', anchor })
    expect(t.anchor).toEqual(anchor)
  })

  it('toThread defaults a missing anchor to null (plain comment thread)', async () => {
    client.get.mockResolvedValue({
      data: { threads: [{ id: 't1', file_uid: 'f1', opened_by: 'bob' }] },
    })
    const [t] = await discussionService.listThreads('f1')
    expect(t.anchor).toBeNull()
  })
})

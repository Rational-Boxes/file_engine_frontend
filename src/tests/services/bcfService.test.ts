import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcfService, { buildBcfTopic, bcfFilename } from '@/services/bcfService'
import type { Thread } from '@/services/discussionService'

vi.mock('@/utils/tokenStorage', () => ({
  tokenStorage: {
    getAccessToken: vi.fn(() => 'sess-token'),
    getActiveTenant: vi.fn(() => 'acme'),
  },
}))

function comment(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    threadId: 'th1',
    parentCommentId: null,
    author: 'alice',
    body: 'The duct clashes here.',
    createdAt: '',
    editedAt: null,
    deleted: false,
    redacted: false,
    ...over,
  }
}

function anchoredThread(over: Partial<Thread> = {}): Thread {
  return {
    id: 'th1',
    fileUid: 'f1',
    version: 'v1',
    title: 'Duct clash',
    status: 'open',
    openedBy: 'alice',
    createdAt: '',
    updatedAt: '',
    resolvedBy: null,
    resolvedVersion: null,
    anchorStale: false,
    anchor: {
      kind: 'model-viewpoint',
      viewpoint: { perspective_camera: { field_of_view: 60 } },
      object_refs: [{ id: 'wall-1' }],
    },
    comments: [comment(), comment({ id: 'c2', author: 'bob', body: 'Rerouted.' })],
    ...over,
  } as unknown as Thread
}

describe('bcfService.buildBcfTopic', () => {
  it('maps an anchored thread into a BCF topic linking every comment to the viewpoint', () => {
    const t = buildBcfTopic(anchoredThread())!
    expect(t.guid).toBe('th1')
    expect(t.title).toBe('Duct clash')
    expect(t.topic_status).toBe('Open')
    expect(t.creation_author).toBe('alice')
    expect(t.comments.map((c) => c.guid)).toEqual(['c1', 'c2'])
    expect(t.comments.every((c) => c.viewpoint_guid === 'th1-vp')).toBe(true)
    expect(t.viewpoints).toEqual([
      { guid: 'th1-vp', viewpoint: { perspective_camera: { field_of_view: 60 } } },
    ])
  })

  it('maps a resolved thread to Closed and drops deleted/redacted comments', () => {
    const t = buildBcfTopic(
      anchoredThread({
        status: 'resolved',
        comments: [comment(), comment({ id: 'c2', body: 'gone', deleted: true })] as never,
      }),
    )!
    expect(t.topic_status).toBe('Closed')
    expect(t.comments.map((c) => c.guid)).toEqual(['c1'])
  })

  it('falls back to the first comment line, then a generic title', () => {
    expect(buildBcfTopic(anchoredThread({ title: '' }))!.title).toBe('The duct clashes here.')
    expect(buildBcfTopic(anchoredThread({ title: '', comments: [] }))!.title).toBe('Model comment')
  })

  it('returns null for a plain (non-anchored) thread', () => {
    expect(buildBcfTopic(anchoredThread({ anchor: null }))).toBeNull()
  })
})

describe('bcfService.bcfFilename', () => {
  it('sanitizes the title into a .bcfzip filename', () => {
    const t = buildBcfTopic(anchoredThread({ title: 'Duct / beam clash!' }))!
    expect(bcfFilename(t)).toBe('Duct_beam_clash.bcfzip')
  })
})

describe('bcfService.downloadThreadBcf', () => {
  const clickSpy = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    clickSpy.mockClear()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('POSTs the topic with the session bearer + tenant and triggers a .bcfzip download', async () => {
    const blob = new Blob(['zip'], { type: 'application/octet-stream' })
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    })
    await bcfService.downloadThreadBcf(anchoredThread({ title: 'T' }))
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/bcf/2.1/bcf-xml/export')
    expect(init.method).toBe('POST')
    // Session-gated: the SPA bearer + active tenant ride with the request.
    expect(init.headers.Authorization).toBe('Bearer sess-token')
    expect(init.headers['X-Tenant']).toBe('acme')
    expect(JSON.parse(init.body).topics[0].guid).toBe('th1')
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('surfaces an expired-session message on 401', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 })
    await expect(bcfService.downloadThreadBcf(anchoredThread())).rejects.toThrow('session has expired')
  })

  it('throws on a non-OK response', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 })
    await expect(bcfService.downloadThreadBcf(anchoredThread())).rejects.toThrow('BCF export failed (500)')
  })

  it('throws for a thread with no viewpoint', async () => {
    await expect(bcfService.downloadThreadBcf(anchoredThread({ anchor: null }))).rejects.toThrow(
      'no 3D viewpoint',
    )
  })
})

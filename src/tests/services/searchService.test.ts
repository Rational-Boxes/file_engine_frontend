import { describe, it, expect, beforeEach, vi } from 'vitest'

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))

vi.mock('@/services/csaiClient', () => ({
  default: { post, get },
}))

import { searchService } from '@/services/searchService'

describe('searchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts the query (with optional limit/fuzzy) and maps hits', async () => {
    post.mockResolvedValue({
      data: { hits: [{ file_uid: 'f1', name: 'a.md', snippet: '…north…', score: 0.9 }] },
    })
    const hits = await searchService.search('north', { limit: 5, fuzzy: false })
    expect(post).toHaveBeenCalledWith('/search', { query: 'north', limit: 5, fuzzy: false })
    expect(hits).toEqual([{ fileUid: 'f1', name: 'a.md', snippet: '…north…', score: 0.9 }])
  })

  it('omits absent options and tolerates a missing hits array', async () => {
    post.mockResolvedValue({ data: {} })
    expect(await searchService.search('q')).toEqual([])
    expect(post).toHaveBeenCalledWith('/search', { query: 'q' })
  })

  it('fetches extracted document text', async () => {
    get.mockResolvedValue({ data: { text: '# Title', truncated: true } })
    expect(await searchService.getText('f1')).toEqual({ text: '# Title', truncated: true })
    expect(get).toHaveBeenCalledWith('/documents/f1/text')
  })

  it('requests on-demand preview generation', async () => {
    post.mockResolvedValue({
      data: { status: 'converted', renditions: ['v-preview.png'], has_markdown: true },
    })
    expect(await searchService.generatePreview('f1')).toEqual({
      status: 'converted',
      renditions: ['v-preview.png'],
      hasMarkdown: true,
    })
    expect(post).toHaveBeenCalledWith('/documents/f1/convert', {})
  })
})

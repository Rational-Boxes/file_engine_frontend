import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { FileItem } from '@/services/fileService'

const { loadRenditionSet, renditionObjectUrl, revokeRenditionUrl } = vi.hoisted(() => ({
  loadRenditionSet: vi.fn(),
  renditionObjectUrl: vi.fn(),
  revokeRenditionUrl: vi.fn(),
}))
vi.mock('@/services/renditions', () => ({
  loadRenditionSet,
  renditionObjectUrl,
  revokeRenditionUrl,
  thumbnailImage: (set: { thumbnail?: unknown; poster?: unknown }) => set?.thumbnail ?? set?.poster,
}))

import FileThumbnail from '@/components/FileThumbnail.vue'

const item = (over: Partial<FileItem> = {}): FileItem => ({
  uid: 'f1',
  name: 'a.pdf',
  type: 'file',
  size: 1,
  isDirectory: false,
  renditionCount: 1,
  hasRenditions: true,
  ...over,
})

describe('FileThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renditionObjectUrl.mockResolvedValue('blob:thumb')
  })

  it('lazy-loads the thumbnail rendition for a file that has one', async () => {
    loadRenditionSet.mockResolvedValue({
      thumbnail: { uid: 't1', name: 'v-thumbnail.png', fmt: 'thumbnail', ext: 'png', version: 'v' },
    })
    const w = mount(FileThumbnail, { props: { item: item() } })
    await flushPromises()
    expect(loadRenditionSet).toHaveBeenCalledWith('f1')
    expect(renditionObjectUrl).toHaveBeenCalledWith('t1')
    expect(w.find('img.thumb-img').attributes('src')).toBe('blob:thumb')
  })

  it('shows the type icon and fetches nothing without renditions', async () => {
    const w = mount(FileThumbnail, { props: { item: item({ hasRenditions: false, renditionCount: 0 }) } })
    await flushPromises()
    expect(loadRenditionSet).not.toHaveBeenCalled()
    expect(w.find('img').exists()).toBe(false)
    expect(w.text()).toBe('📄')
  })

  it('shows the folder icon for a directory (no fetch)', async () => {
    const w = mount(FileThumbnail, {
      props: { item: item({ isDirectory: true, type: 'directory', name: 'docs', hasRenditions: false }) },
    })
    await flushPromises()
    expect(loadRenditionSet).not.toHaveBeenCalled()
    expect(w.text()).toBe('📁')
  })

  it('keeps the fallback icon if the thumbnail fails to load', async () => {
    loadRenditionSet.mockRejectedValue(new Error('nope'))
    const w = mount(FileThumbnail, { props: { item: item() } })
    await flushPromises()
    expect(w.find('img').exists()).toBe(false)
    expect(w.text()).toBe('📄')
  })
})

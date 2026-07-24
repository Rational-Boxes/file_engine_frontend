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
  deleted: false,
  createdAt: 0,
  modifiedAt: 0,
  owner: '',
  createdBy: '',
  modifiedBy: '',
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

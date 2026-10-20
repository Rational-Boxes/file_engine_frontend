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

// The file browser's conversion option: "Generate preview" appears on a row
// only where an installed plugin can render the format and nothing has been
// generated yet, and it opens the preview overlay converting.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { FileItem } from '@/stores/files'

const items = [
  { uid: 'doc1', name: 'report.docx', hasRenditions: false },
  { uid: 'doc2', name: 'deck.pptx', hasRenditions: true },
  { uid: 'exe1', name: 'setup.exe', hasRenditions: false },
  { uid: 'mp31', name: 'song.mp3', hasRenditions: false },
  { uid: 'pdf1', name: 'contract.pdf', hasRenditions: false },
].map((i) => ({
  isDirectory: false, renditionCount: i.hasRenditions ? 1 : 0, size: 10, deleted: false,
  createdAt: 0, modifiedAt: 0, createdBy: 'a', modifiedBy: 'a', type: 'file', ...i,
})) as unknown as FileItem[]

const h = vi.hoisted(() => ({ previewOpen: vi.fn() }))
const caps = vi.hoisted(() => ({ known: true, previewExtensions: ['docx', 'pptx', 'pdf'] as string[] }))

vi.mock('@/composables/useCapabilities', async () => {
  const { computed, reactive } = await import('vue')
  return {
    useCapabilities: () => ({
      features: reactive({ editing: false, editingExtensions: [], discussion: false, sharing: false }),
      ready: computed(() => true),
      conversionFormats: computed(() => ({ known: caps.known, previewExtensions: caps.previewExtensions })),
    }),
  }
})
vi.mock('@/stores/files', () => ({
  useFileStore: () => ({
    items, breadcrumbs: [], selected: new Set<string>(), clipboard: null, renditions: [],
    renditionsOpen: false, renditionsLoading: false, drawerOpen: false, detailItem: null,
    error: '', loading: false, showDeleted: false, canWrite: true, canListDeleted: false,
    canPasteHere: false, canUndelete: false, allSelected: false, someSelected: false,
    openDetails: vi.fn(), openDirectory: vi.fn(), load: vi.fn(), toggleSelect: vi.fn(),
    toggleSelectAll: vi.fn(), clearSelection: vi.fn(), clearClipboard: vi.fn(), paste: vi.fn(),
    toggleShowDeleted: vi.fn(), openRenditions: vi.fn(), closeRenditions: vi.fn(),
    openCurrentFolderDetails: vi.fn(), navigateToCrumb: vi.fn(), renditionsFor: () => [],
    downloadItem: vi.fn(), setClipboard: vi.fn(),
  }),
}))
vi.mock('@/stores/comments', () => ({ useCommentsStore: () => ({ open: vi.fn() }) }))
vi.mock('@/stores/model3d', () => ({ useModel3dStore: () => ({ open: vi.fn() }) }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open: h.previewOpen }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ accessLevel: 'admin' }) }))
vi.mock('@/stores/upload', () => ({
  useUploadStore: () => ({ items: [], active: false, uploadFiles: vi.fn(), clear: vi.fn() }),
}))
vi.mock('@/services/shareService', () => ({ shareService: { dropProvenance: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/services/discussionService', () => ({ discussionService: { flagCounts: vi.fn().mockResolvedValue({}) } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}))

import FileBrowserView from '@/views/FileBrowserView.vue'

const mountView = () =>
  mount(FileBrowserView, {
    global: {
      stubs: {
        AppNav: true, HelpIcon: true, UploadTray: true, FileDetailsDrawer: true,
        ConfirmModal: true, KebabMenu: true, FileThumbnail: true, RouterLink: true,
      },
    },
  })

const menu = (w: ReturnType<typeof mountView>, uid: string) =>
  w.find(`tr[data-uid="${uid}"]`).findComponent({ name: 'KebabMenu' })
const actions = (w: ReturnType<typeof mountView>, uid: string) =>
  (menu(w, uid).props('items') as { action: string }[]).map((i) => i.action)

describe('file browser — Generate preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    caps.known = true
  })

  it('is offered for a convertible file with no preview yet', () => {
    expect(actions(mountView(), 'doc1')).toContain('generate')
  })

  it('is not offered once renditions exist', () => {
    expect(actions(mountView(), 'doc2')).not.toContain('generate')
  })

  it('is not offered for an executable, or a format nothing installed converts', () => {
    const w = mountView()
    expect(actions(w, 'exe1')).not.toContain('generate')
    expect(actions(w, 'mp31')).not.toContain('generate')
    expect(actions(w, 'exe1')).toContain('download')
  })

  it('is not offered for a file that previews on its own', () => {
    expect(actions(mountView(), 'pdf1')).not.toContain('generate')
  })

  it('opens the preview overlay converting', async () => {
    const w = mountView()
    await menu(w, 'doc1').vm.$emit('select', 'generate')
    expect(h.previewOpen).toHaveBeenCalledWith('doc1', 'report.docx', { generate: true })
  })
})

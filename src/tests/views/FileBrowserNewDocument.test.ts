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

// "New document" in the toolbar: that it is THERE, next to New folder, and that
// choosing a type creates the file and opens the editor.
//
// The helpers and the store action are covered elsewhere; what those tests
// cannot tell you is whether the control actually appears, which is the only
// thing a user experiences. Both gates are asserted from the negative side too,
// because each one hides the button completely and a hidden button is
// indistinguishable from a feature that never shipped.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  createDocument: vi.fn(),
  canWrite: true,
  editing: true,
  editingExtensions: [] as string[],
}))

vi.mock('@/stores/files', () => ({
  useFileStore: () => ({
    items: [],
    breadcrumbs: [],
    selected: new Set<string>(),
    clipboard: null,
    renditions: [],
    renditionsOpen: false,
    renditionsLoading: false,
    drawerOpen: false,
    detailItem: null,
    error: '',
    loading: false,
    showDeleted: false,
    get canWrite() { return h.canWrite },
    canListDeleted: false,
    canPasteHere: false,
    canUndelete: false,
    allSelected: false,
    someSelected: false,
    currentUid: 'd1',
    createDocument: h.createDocument,
    createDirectory: vi.fn(),
    openDetails: vi.fn(),
    openDirectory: vi.fn(),
    load: vi.fn(),
    toggleSelect: vi.fn(),
    toggleSelectAll: vi.fn(),
    clearSelection: vi.fn(),
    clearClipboard: vi.fn(),
    paste: vi.fn(),
    toggleShowDeleted: vi.fn(),
    openRenditions: vi.fn(),
    closeRenditions: vi.fn(),
    openCurrentFolderDetails: vi.fn(),
    navigateToCrumb: vi.fn(),
    renditionsFor: () => [],
    downloadItem: vi.fn(),
    setClipboard: vi.fn(),
  }),
}))
vi.mock('@/composables/useCapabilities', () => ({
  useCapabilities: () => ({
    features: {
      get editing() { return h.editing },
      get editingExtensions() { return h.editingExtensions },
    },
    ready: { value: true },
  }),
}))
vi.mock('@/stores/comments', () => ({ useCommentsStore: () => ({ open: vi.fn() }) }))
vi.mock('@/stores/model3d', () => ({ useModel3dStore: () => ({ open: vi.fn() }) }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ accessLevel: 'admin' }) }))
vi.mock('@/stores/upload', () => ({
  useUploadStore: () => ({ items: [], active: false, uploadFiles: vi.fn(), clear: vi.fn() }),
}))
vi.mock('@/services/shareService', () => ({ shareService: { dropProvenance: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/services/discussionService', () => ({ discussionService: { flagCounts: vi.fn().mockResolvedValue({}) } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: h.push, back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}))

import FileBrowserView from '@/views/FileBrowserView.vue'

// KebabMenu is rendered for real — the menu IS the feature here, so stubbing it
// would leave the test passing with nothing on screen.
const mountView = () =>
  mount(FileBrowserView, {
    global: {
      stubs: {
        AppNav: true,
        HelpIcon: true,
        UploadTray: true,
        FileDetailsDrawer: true,
        ConfirmModal: true,
        FileThumbnail: true,
        RouterLink: true,
      },
    },
    attachTo: document.body,
  })

const newDocButton = (w: ReturnType<typeof mountView>) =>
  w.findAll('button').find((b) => b.text().startsWith('New document'))

describe('New document in the toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.canWrite = true
    h.editing = true
    h.editingExtensions = []
  })

  it('renders next to New folder', () => {
    const w = mountView()
    const labels = w.findAll('button').map((b) => b.text())
    const folder = labels.findIndex((t) => t === 'New folder')
    const doc = labels.findIndex((t) => t.startsWith('New document'))
    expect(folder).toBeGreaterThanOrEqual(0)
    expect(doc).toBe(folder + 1)
  })

  it('offers the three office types', async () => {
    const w = mountView()
    await newDocButton(w)!.trigger('click')
    await flushPromises()
    const menu = document.querySelector('.kebab-menu')
    expect(menu?.textContent).toContain('Word document')
    expect(menu?.textContent).toContain('Spreadsheet')
    expect(menu?.textContent).toContain('Presentation')
    w.unmount()
  })

  it('offers only what the Document Server reports it opens', async () => {
    h.editingExtensions = ['docx', 'txt']
    const w = mountView()
    await newDocButton(w)!.trigger('click')
    await flushPromises()
    const menu = document.querySelector('.kebab-menu')
    expect(menu?.textContent).toContain('Word document')
    expect(menu?.textContent).not.toContain('Spreadsheet')
    w.unmount()
  })

  it('creates the document and opens the editor', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Notes')
    h.createDocument.mockResolvedValue('new-uid')
    const w = mountView()
    await newDocButton(w)!.trigger('click')
    await flushPromises()
    const word = Array.from(document.querySelectorAll('.kebab-item'))
      .find((b) => b.textContent?.includes('Word document')) as HTMLElement
    word.click()
    await flushPromises()
    expect(h.createDocument).toHaveBeenCalledWith('Notes', 'docx')
    expect(h.push).toHaveBeenCalledWith({ name: 'Edit', params: { uid: 'new-uid' } })
    w.unmount()
  })

  it('creates nothing when the name prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    const w = mountView()
    await newDocButton(w)!.trigger('click')
    await flushPromises()
    const word = Array.from(document.querySelectorAll('.kebab-item'))
      .find((b) => b.textContent?.includes('Word document')) as HTMLElement
    word.click()
    await flushPromises()
    expect(h.createDocument).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
    w.unmount()
  })

  it('does not navigate when creation failed', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Notes')
    h.createDocument.mockResolvedValue(null) // store reported the error itself
    const w = mountView()
    await newDocButton(w)!.trigger('click')
    await flushPromises()
    const word = Array.from(document.querySelectorAll('.kebab-item'))
      .find((b) => b.textContent?.includes('Word document')) as HTMLElement
    word.click()
    await flushPromises()
    expect(h.push).not.toHaveBeenCalled()
    w.unmount()
  })

  it('is hidden without write access here — the same gate as New folder', () => {
    h.canWrite = false
    const w = mountView()
    expect(newDocButton(w)).toBeUndefined()
    // Both controls answer to WRITE and to nothing else, so they appear and
    // disappear together. Asserted as a pair: the bug this replaces was one of
    // them vanishing on its own.
    expect(w.findAll('button').map((b) => b.text())).not.toContain('New folder')
  })

  it('STAYS VISIBLE when the deployment reports no in-browser editing', () => {
    // Deliberate. A capability probe that says no, answers late, or cannot be
    // reached must not remove the control — a missing button reads as a feature
    // that was never shipped, which is how this was first reported. Creating the
    // file is a filesystem act; the editor speaks for itself.
    h.editing = false
    const w = mountView()
    expect(newDocButton(w)).toBeDefined()
    expect(w.findAll('button').map((b) => b.text())).toContain('New folder')
  })

  it('offers the standard types when the reported list matches none of them', async () => {
    h.editingExtensions = ['pdf', 'jpg']
    const w = mountView()
    await newDocButton(w)!.trigger('click')
    await flushPromises()
    const menu = document.querySelector('.kebab-menu')
    expect(menu?.textContent).toContain('Word document')
    w.unmount()
  })
})

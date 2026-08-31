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
//
// Row gestures: single click opens the details drawer, double click opens the
// preview — or the comment window where there is nothing to preview.
//
// The two share a row, so the interesting behaviour is not either one alone but
// the interaction: a double click must NOT also leave the drawer open behind the
// preview, which is what happens the moment the single-click handler stops
// waiting out the grace period.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { FileItem } from '@/stores/files'

const items = [
  { uid: 'pdf1', name: 'contract.pdf', isDirectory: false, hasRenditions: false },
  { uid: 'doc1', name: 'deck.pptx', isDirectory: false, hasRenditions: true },
  { uid: 'raw1', name: 'part.step', isDirectory: false, hasRenditions: false },
  // Has renditions, but none of them is a display surface — the case a bare
  // "hasRenditions" test would get wrong.
  { uid: 'mk1', name: 'notes.txt', isDirectory: false, hasRenditions: true },
  // Rows carrying their side-car children, as ?children=1 supplies them.
  {
    uid: 'ifc1', name: 'house.ifc', isDirectory: false, hasRenditions: true,
    children: [
      { uid: 'c1', name: '20260101_000000.000-model.xkt', size: 9, modifiedAt: 0 },
      { uid: 'c2', name: '20260101_000000.000-metamodel.json', size: 9, modifiedAt: 0 },
    ],
  },
  {
    uid: 'txt1', name: 'readme.txt', isDirectory: false, hasRenditions: true,
    children: [{ uid: 'c3', name: '20260101_000000.000-markup.json', size: 9, modifiedAt: 0 }],
  },
  { uid: 'dir1', name: 'Reports', isDirectory: true, hasRenditions: false },
].map((i) => ({
  renditionCount: i.hasRenditions ? 1 : 0,
  size: 10,
  deleted: false,
  createdAt: 0,
  modifiedAt: 0,
  createdBy: 'a',
  modifiedBy: 'a',
  type: 'file',
  ...i,
})) as unknown as FileItem[]

const h = vi.hoisted(() => ({
  openDetails: vi.fn(),
  openDirectory: vi.fn(),
  commentsOpen: vi.fn(),
  previewOpen: vi.fn(),
  model3dOpen: vi.fn(),
  push: vi.fn(),
  loadRenditionSet: vi.fn(),
}))

// Only the lookup is faked. The real helpers stay, because the rule under test
// uses them to decide whether a rendition is a format the browser can show.
vi.mock('@/services/renditions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/renditions')>()),
  loadRenditionSet: h.loadRenditionSet,
}))

vi.mock('@/stores/files', () => ({
  useFileStore: () => ({
    items,
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
    canWrite: true,
    canListDeleted: false,
    canPasteHere: false,
    canUndelete: false,
    allSelected: false,
    someSelected: false,
    openDetails: h.openDetails,
    openDirectory: h.openDirectory,
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
vi.mock('@/stores/comments', () => ({ useCommentsStore: () => ({ open: h.commentsOpen }) }))
vi.mock('@/stores/model3d', () => ({ useModel3dStore: () => ({ open: h.model3dOpen }) }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open: h.previewOpen }) }))
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

const GRACE = 250

const mountView = () =>
  mount(FileBrowserView, {
    global: {
      stubs: {
        AppNav: true,
        HelpIcon: true,
        UploadTray: true,
        FileDetailsDrawer: true,
        ConfirmModal: true,
        KebabMenu: true,
        FileThumbnail: true,
        RouterLink: true,
      },
    },
  })

const rowFor = (w: ReturnType<typeof mountView>, uid: string) =>
  w.find(`tr[data-uid="${uid}"]`)

describe('file row gestures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the details drawer on a single click, once the grace period passes', async () => {
    const w = mountView()
    await rowFor(w, 'doc1').find('td.name').trigger('click')

    // Nothing yet: the handler is still waiting to see whether a second click
    // is coming.
    expect(h.openDetails).not.toHaveBeenCalled()

    vi.advanceTimersByTime(GRACE)
    expect(h.openDetails).toHaveBeenCalledTimes(1)
    expect(h.openDetails.mock.calls[0][0].uid).toBe('doc1')
    expect(h.push).not.toHaveBeenCalled()
  })

  it('opens the preview on a double click, and does NOT open the drawer too', async () => {
    h.loadRenditionSet.mockResolvedValue({ pdf: { uid: 'r1', name: 'v-pdf.pdf', fmt: 'pdf', ext: 'pdf', version: 'v' } })
    const w = mountView()
    const row = rowFor(w, 'doc1')
    // A real double click delivers both clicks and then the dblclick event.
    await row.find('td.name').trigger('click')
    await row.find('td.name').trigger('click')
    await row.trigger('dblclick')
    await flushPromises()

    expect(h.previewOpen).toHaveBeenCalledWith('doc1', 'deck.pptx')
    // The OVERLAY, not the route: closing it must return to this listing, not
    // leave a navigation for the user to press Back on.
    expect(h.push).not.toHaveBeenCalled()

    // The pending single click must have been cancelled — this is the whole
    // point of the grace period.
    vi.advanceTimersByTime(GRACE * 4)
    expect(h.openDetails).not.toHaveBeenCalled()
  })

  it('previews a native PDF with no renditions, without a lookup', async () => {
    const w = mountView()
    await rowFor(w, 'pdf1').trigger('dblclick')
    await flushPromises()
    expect(h.previewOpen).toHaveBeenCalledWith('pdf1', 'contract.pdf')
    expect(h.push).not.toHaveBeenCalled()
    expect(h.commentsOpen).not.toHaveBeenCalled()
    // The row settled it, so no request was made.
    expect(h.loadRenditionSet).not.toHaveBeenCalled()
  })

  it('falls back to comments when the renditions are not display surfaces', async () => {
    // Has renditions, but only a markup overlay — nothing to show.
    h.loadRenditionSet.mockResolvedValue({ markup: { uid: 'm', name: 'v-markup.json', fmt: 'markup', ext: 'json', version: 'v' } })
    const w = mountView()
    await rowFor(w, 'mk1').trigger('dblclick')
    await flushPromises()
    expect(h.loadRenditionSet).toHaveBeenCalledWith('mk1')
    expect(h.commentsOpen).toHaveBeenCalledWith('mk1', 'notes.txt')
    expect(h.push).not.toHaveBeenCalled()
  })

  it('sends the user to the preview if the rendition lookup fails', async () => {
    // The lookup is an optimisation, not a gate: the preview page loads the same
    // renditions itself and can explain what it finds.
    h.loadRenditionSet.mockRejectedValue(new Error('offline'))
    const w = mountView()
    await rowFor(w, 'mk1').trigger('dblclick')
    await flushPromises()
    expect(h.previewOpen).toHaveBeenCalledWith('mk1', 'notes.txt')
    expect(h.commentsOpen).not.toHaveBeenCalled()
  })

  it('opens the comment window when there is nothing to preview', async () => {
    const w = mountView()
    await rowFor(w, 'raw1').trigger('dblclick')
    await flushPromises()
    expect(h.commentsOpen).toHaveBeenCalledWith('raw1', 'part.step')
    expect(h.previewOpen).not.toHaveBeenCalled()
  })

  it('decides from the row when the listing supplied the children, with no request', async () => {
    const w = mountView()
    await rowFor(w, 'ifc1').trigger('dblclick')
    await flushPromises()
    // A 3D model opens the MODEL viewer, not the document overlay — the
    // document preview has nothing to render for geometry.
    expect(h.model3dOpen).toHaveBeenCalledWith('ifc1', 'house.ifc')
    expect(h.previewOpen).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
    // The whole point of ?children=1: the answer was already on the row.
    expect(h.loadRenditionSet).not.toHaveBeenCalled()
  })

  it('falls back to comments from the row data alone', async () => {
    const w = mountView()
    await rowFor(w, 'txt1').trigger('dblclick')
    await flushPromises()
    expect(h.commentsOpen).toHaveBeenCalledWith('txt1', 'readme.txt')
    expect(h.previewOpen).not.toHaveBeenCalled()
    expect(h.loadRenditionSet).not.toHaveBeenCalled()
  })

  it('still enquires when the row has no children key — "not asked" is not "has none"', async () => {
    // The bridge bounds how many entries it interrogates per listing, so beyond
    // that bound rows arrive without the key. Treating that as "no side-cars"
    // would deny a preview to files that have one.
    h.loadRenditionSet.mockResolvedValue({ pdf: { uid: 'r', name: 'v-pdf.pdf', fmt: 'pdf', ext: 'pdf', version: 'v' } })
    const w = mountView()
    await rowFor(w, 'doc1').trigger('dblclick')   // hasRenditions, but no children key
    await flushPromises()
    expect(h.loadRenditionSet).toHaveBeenCalledWith('doc1')
    expect(h.previewOpen).toHaveBeenCalledWith('doc1', 'deck.pptx')
  })

  it('never changes the route, so closing the preview leaves no extra Back to press', async () => {
    // The regression this guards: routing to /preview/:uid works, but it puts
    // the browser one navigation deeper, so closing the preview strands the user
    // on a page they must press Back on to get their listing again — for a
    // gesture whose whole job is a quick look.
    h.loadRenditionSet.mockResolvedValue({ pdf: { uid: 'r', name: 'v-pdf.pdf', fmt: 'pdf', ext: 'pdf', version: 'v' } })
    const w = mountView()
    for (const uid of ['pdf1', 'doc1', 'ifc1', 'raw1', 'txt1', 'mk1']) {
      await rowFor(w, uid).trigger('dblclick')
      await flushPromises()
    }
    expect(h.push).not.toHaveBeenCalled()
  })

  it('still navigates into a folder on a double click', async () => {
    const w = mountView()
    await rowFor(w, 'dir1').trigger('dblclick')
    await flushPromises()
    expect(h.openDirectory).toHaveBeenCalledTimes(1)
    expect(h.openDirectory.mock.calls[0][0].uid).toBe('dir1')
    expect(h.previewOpen).not.toHaveBeenCalled()
    expect(h.commentsOpen).not.toHaveBeenCalled()
  })
})

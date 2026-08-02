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
import { h } from 'vue'

const { loadRenditionSet, renditionObjectUrl, renditionText, revokeRenditionUrl } = vi.hoisted(() => ({
  loadRenditionSet: vi.fn(),
  renditionObjectUrl: vi.fn(),
  renditionText: vi.fn(),
  revokeRenditionUrl: vi.fn(),
}))
const { generatePreview } = vi.hoisted(() => ({ generatePreview: vi.fn() }))

vi.mock('@/services/renditions', () => ({
  loadRenditionSet,
  renditionObjectUrl,
  renditionText,
  revokeRenditionUrl,
  // Faithful reimpl: the preview still is a PNG preview, else a video poster.
  previewImage: (set: { preview?: { ext: string }; poster?: unknown; thumbnail?: { ext: string } }) => {
    const isImg = (r?: { ext: string }) => !!r && ['png', 'webp', 'jpg', 'jpeg', 'gif'].includes(r.ext)
    if (isImg(set?.preview)) return set.preview
    return set?.poster ?? (isImg(set?.thumbnail) ? set.thumbnail : undefined)
  },
}))
vi.mock('@/services/searchService', () => ({ searchService: { generatePreview } }))
const { downloadFile, checkPermission } = vi.hoisted(() => ({
  downloadFile: vi.fn(),
  checkPermission: vi.fn(),
}))
vi.mock('@/services/fileService', () => ({ fileService: { downloadFile, checkPermission } }))
const { open, close } = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn() }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open, close }) }))
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }), useRoute: () => ({ query: {} }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ tenant: 'default' }) }))
// The discussion children are exercised by their own tests; stub them here so the
// preview tests stay focused (and don't pull in the discussion service / WS).
vi.mock('@/components/ThreadPanel.vue', () => ({ default: { name: 'ThreadPanel', render: () => null } }))
vi.mock('@/components/ThreadOverlay.vue', () => ({ default: { name: 'ThreadOverlay', render: () => null } }))
// The PDF.js viewer (Phase 7.1) dynamic-imports pdfjs internally; stub it and expose
// its `src`/`editable` props so the preview tests can assert what the viewer is
// pointed at without loading pdfjs.
vi.mock('@/components/PdfViewer.vue', () => ({
  default: {
    name: 'PdfViewer',
    props: ['src', 'editable', 'fullWidth'],
    render(this: { src: string; editable: boolean }) {
      return h('div', { class: 'pv-stub', 'data-src': this.src, 'data-editable': String(this.editable) })
    },
  },
}))

import DocumentPreview from '@/components/DocumentPreview.vue'
import ShadowHtml from '@/components/ShadowHtml.vue'

const ref_ = (uid: string, fmt: string, ext: string) => ({ uid, name: `v-${fmt}.${ext}`, fmt, ext, version: 'v' })

describe('DocumentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renditionObjectUrl.mockImplementation((uid: string) => Promise.resolve('blob:' + uid))
    checkPermission.mockResolvedValue(false) // no WRITE by default → no Annotate affordance
  })

  it('shows the first-page preview image WITHOUT fetching the PDF on open', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png'), pdf: ref_('pdf1', 'pdf', 'pdf') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx', hasRenditions: true } })
    await flushPromises()

    expect(loadRenditionSet).toHaveBeenCalledWith('f1')
    // Only the preview image is fetched — the PDF is NOT pulled yet.
    expect(renditionObjectUrl).toHaveBeenCalledTimes(1)
    expect(renditionObjectUrl).toHaveBeenCalledWith('p1', 'image/png')
    expect(w.find('img.dp-img').attributes('src')).toBe('blob:p1')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.find('.btn').exists()).toBe(true) // "Open document (PDF)"
  })

  it('shows Document/Chat log tabs and renders the log in a shadow root on tab click', async () => {
    loadRenditionSet.mockResolvedValue({ chatlog: ref_('cl1', 'chatlog', 'html') })
    renditionText.mockResolvedValue('<style>.msg{}</style><h1>Chat provenance log</h1>')
    const w = mount(DocumentPreview, { props: { uid: 'r1', name: 'report.html', hasRenditions: true } })
    await flushPromises()
    const tabs = w.findAll('button.dp-tab')
    expect(tabs.map((t) => t.text())).toEqual(['Document', '🧾 Chat log'])
    // The document tab is active first; the log is fetched only when its tab opens.
    expect(w.findComponent(ShadowHtml).exists()).toBe(false)
    await tabs.find((t) => t.text().includes('Chat log'))!.trigger('click')
    await flushPromises()
    expect(renditionText).toHaveBeenCalledWith('cl1')
    // Rendered via ShadowHtml (bare) for style isolation — not an iframe.
    const shadow = w.findComponent(ShadowHtml)
    expect(shadow.exists()).toBe(true)
    expect(shadow.props('bare')).toBe(true)
    expect(shadow.props('html')).toContain('Chat provenance log')
    expect(w.find('iframe').exists()).toBe(false)
  })

  it('shows no tabs when the file has no chatlog rendition', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'x.docx', hasRenditions: true } })
    await flushPromises()
    expect(w.find('.dp-tabs').exists()).toBe(false)
    expect(w.find('img.dp-img').exists()).toBe(true) // just the document preview
  })

  it('in the drawer, opening the PDF raises the overlay (no embed/fetch, no navigation)', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png'), pdf: ref_('pdf1', 'pdf', 'pdf') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx' } })
    await flushPromises()

    await w.find('.btn').trigger('click') // "Open document (PDF)"
    expect(open).toHaveBeenCalledWith('f1', 'report.docx') // overlay, not a route change
    expect(w.find('iframe').exists()).toBe(false)
    expect(renditionObjectUrl).not.toHaveBeenCalledWith('pdf1') // PDF never fetched in the drawer
  })

  it('on the full-width review page, embeds the Office pdf rendition (auto-opens)', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png'), pdf: ref_('pdf1', 'pdf', 'pdf') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx', fullWidth: true } })
    await flushPromises()

    expect(renditionObjectUrl).toHaveBeenCalledWith('pdf1', 'application/pdf')
    const viewer = w.find('.pv-stub')
    expect(viewer.exists()).toBe(true)
    expect(viewer.attributes('data-src')).toBe('blob:pdf1')
    expect(open).not.toHaveBeenCalled()
  })

  it('the modal offers a "Download original" link (and no back-to-preview)', async () => {
    downloadFile.mockResolvedValue(new Blob(['data']))
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:dl')
    globalThis.URL.revokeObjectURL = vi.fn()
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png'), pdf: ref_('pdf1', 'pdf', 'pdf') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx', fullWidth: true } })
    await flushPromises()

    expect(w.text()).not.toContain('Back to preview')
    const dl = w.findAll('.link').find((b) => b.text().includes('Download original'))
    expect(dl).toBeTruthy()
    await dl!.trigger('click')
    expect(downloadFile).toHaveBeenCalledWith('f1') // fetches the original source bytes
  })

  it('the modal "Open file location" deep-links to the file (and closes the overlay)', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png'), pdf: ref_('pdf1', 'pdf', 'pdf') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx', fullWidth: true } })
    await flushPromises()

    const loc = w.findAll('.link').find((b) => b.text().includes('Open file location'))
    expect(loc).toBeTruthy()
    await loc!.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'FileBrowser', query: { file: 'f1', tenant: 'default' } })
    expect(close).toHaveBeenCalled()
  })

  it('on the full-width review page, opens a native PDF by loading the source itself', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png') }) // no pdf rendition
    const w = mount(DocumentPreview, { props: { uid: 'src-uid', name: 'manual.pdf', fullWidth: true } })
    await flushPromises()

    expect(renditionObjectUrl).toHaveBeenCalledWith('src-uid', 'application/pdf') // the source is the PDF
    expect(w.find('.pv-stub').attributes('data-src')).toBe('blob:src-uid') // PDF.js viewer, not an iframe
  })

  it('shows the markup toolbar (editable viewer) only with WRITE on the full review surface', async () => {
    checkPermission.mockResolvedValue(true) // this user may write → markup tools are shown
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png'), pdf: ref_('pdf1', 'pdf', 'pdf') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx', fullWidth: true } })
    await flushPromises()

    expect(checkPermission).toHaveBeenCalledWith('f1', { permission: 'w' })
    // The viewer is editable (its markup toolbar is always shown for a writer).
    expect(w.find('.pv-stub').attributes('data-editable')).toBe('true')
    // A hint explains markup auto-saves with the comment (no separate save step).
    expect(w.text().toLowerCase()).toContain('saves with your comment')
  })

  it('keeps the viewer read-only (no markup tools) without WRITE', async () => {
    checkPermission.mockResolvedValue(false)
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png'), pdf: ref_('pdf1', 'pdf', 'pdf') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx', fullWidth: true } })
    await flushPromises()

    expect(w.find('.pv-stub').attributes('data-editable')).toBe('false')
    expect(w.text().toLowerCase()).not.toContain('saves with your comment')
  })

  it('offers no PDF action for a non-PDF without a pdf rendition (e.g. an image)', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'photo.png' } })
    await flushPromises()
    expect(w.find('.btn').exists()).toBe(false)
    expect(w.find('img.dp-img').exists()).toBe(true)
  })

  it('an image preview offers Download original + Open file location (consistent with PDF/video)', async () => {
    downloadFile.mockResolvedValue(new Blob(['img']))
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:dl')
    globalThis.URL.revokeObjectURL = vi.fn()
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'photo.png', fullWidth: true } })
    await flushPromises()

    const dl = w.findAll('.link').find((b) => b.text().includes('Download original'))
    const loc = w.findAll('.link').find((b) => b.text().includes('Open file location'))
    expect(dl).toBeTruthy()
    expect(loc).toBeTruthy()
    await dl!.trigger('click')
    expect(downloadFile).toHaveBeenCalledWith('f1')
    await loc!.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'FileBrowser', query: { file: 'f1', tenant: 'default' } })
  })

  it('for a video in the drawer: shows the poster + a "Play video" action that raises the overlay', async () => {
    // A video emits poster (PNG) + preview (MP4 clip); the still is the poster.
    loadRenditionSet.mockResolvedValue({
      poster: ref_('pf', 'poster', 'png'),
      preview: ref_('clip', 'preview', 'mp4'),
    })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'clip.mp4', hasRenditions: true } })
    await flushPromises()

    expect(renditionObjectUrl).toHaveBeenCalledWith('pf', 'image/png') // poster, not the mp4
    expect(w.find('img.dp-img').attributes('src')).toBe('blob:pf')
    expect(w.find('.btn').text()).toContain('Preview 10 seconds')
    expect(w.find('.btn').text()).toContain('▶') // play icon

    await w.find('.btn').trigger('click') // raises the overlay; clip not fetched in the drawer
    expect(open).toHaveBeenCalledWith('f1', 'clip.mp4')
    expect(renditionObjectUrl).not.toHaveBeenCalledWith('clip', 'video/mp4')
    expect(w.find('video').exists()).toBe(false)
  })

  it('on the full-width review, plays the mp4 clip inline with the poster as <video> poster', async () => {
    loadRenditionSet.mockResolvedValue({
      poster: ref_('pf', 'poster', 'png'),
      preview: ref_('clip', 'preview', 'mp4'),
    })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'clip.mp4', fullWidth: true } })
    await flushPromises()

    expect(renditionObjectUrl).toHaveBeenCalledWith('clip', 'video/mp4')
    const video = w.find('video.dp-video')
    expect(video.exists()).toBe(true)
    expect(video.attributes('src')).toBe('blob:clip')
    expect(video.attributes('poster')).toBe('blob:pf')
  })

  it('shows a "not yet" message + Generate button when there are no renditions', async () => {
    loadRenditionSet.mockResolvedValue({})
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'todo.txt', hasRenditions: false } })
    await flushPromises()
    expect(w.text()).toContain('No preview available yet')
    expect(w.find('.btn').text()).toContain('Generate preview')
  })

  it('re-requests preview generation from CSAI, then reloads to show it', async () => {
    // First load: no renditions; after generate(): a preview appears.
    loadRenditionSet
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ preview: ref_('p1', 'preview', 'png') })
    generatePreview.mockResolvedValue({ status: 'converted', renditions: ['v-preview.png'], hasMarkdown: true })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'doc.pdf' } })
    await flushPromises()
    expect(w.find('img.dp-img').exists()).toBe(false)

    await w.find('.btn').trigger('click') // "Generate preview"
    await flushPromises()

    expect(generatePreview).toHaveBeenCalledWith('f1')
    expect(w.find('img.dp-img').attributes('src')).toBe('blob:p1')
  })
})

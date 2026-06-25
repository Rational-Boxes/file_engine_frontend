import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { loadRenditionSet, renditionObjectUrl, revokeRenditionUrl } = vi.hoisted(() => ({
  loadRenditionSet: vi.fn(),
  renditionObjectUrl: vi.fn(),
  revokeRenditionUrl: vi.fn(),
}))
const { generatePreview } = vi.hoisted(() => ({ generatePreview: vi.fn() }))

vi.mock('@/services/renditions', () => ({
  loadRenditionSet,
  renditionObjectUrl,
  revokeRenditionUrl,
  // Faithful reimpl: the preview still is a PNG preview, else a video poster.
  previewImage: (set: { preview?: { ext: string }; poster?: unknown; thumbnail?: { ext: string } }) => {
    const isImg = (r?: { ext: string }) => !!r && ['png', 'webp', 'jpg', 'jpeg', 'gif'].includes(r.ext)
    if (isImg(set?.preview)) return set.preview
    return set?.poster ?? (isImg(set?.thumbnail) ? set.thumbnail : undefined)
  },
}))
vi.mock('@/services/searchService', () => ({ searchService: { generatePreview } }))
const { open } = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open }) }))

import DocumentPreview from '@/components/DocumentPreview.vue'

const ref_ = (uid: string, fmt: string, ext: string) => ({ uid, name: `v-${fmt}.${ext}`, fmt, ext, version: 'v' })

describe('DocumentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renditionObjectUrl.mockImplementation((uid: string) => Promise.resolve('blob:' + uid))
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
    const frame = w.find('iframe.dp-frame-full')
    expect(frame.exists()).toBe(true)
    expect(frame.attributes('src')).toBe('blob:pdf1')
    expect(open).not.toHaveBeenCalled()
  })

  it('on the full-width review page, opens a native PDF by loading the source itself', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png') }) // no pdf rendition
    const w = mount(DocumentPreview, { props: { uid: 'src-uid', name: 'manual.pdf', fullWidth: true } })
    await flushPromises()

    expect(renditionObjectUrl).toHaveBeenCalledWith('src-uid', 'application/pdf') // the source is the PDF
    expect(w.find('iframe').attributes('src')).toBe('blob:src-uid')
  })

  it('offers no PDF action for a non-PDF without a pdf rendition (e.g. an image)', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'photo.png' } })
    await flushPromises()
    expect(w.find('.btn').exists()).toBe(false)
    expect(w.find('img.dp-img').exists()).toBe(true)
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

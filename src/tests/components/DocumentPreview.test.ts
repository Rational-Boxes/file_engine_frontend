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
}))
vi.mock('@/services/searchService', () => ({ searchService: { generatePreview } }))

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
    expect(renditionObjectUrl).toHaveBeenCalledWith('p1')
    expect(w.find('img.dp-img').attributes('src')).toBe('blob:p1')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.find('.btn').exists()).toBe(true) // "Open document (PDF)"
  })

  it('fetches and embeds the Office pdf rendition only when the user clicks', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png'), pdf: ref_('pdf1', 'pdf', 'pdf') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx' } })
    await flushPromises()

    await w.find('.btn').trigger('click')
    await flushPromises()

    expect(renditionObjectUrl).toHaveBeenCalledWith('pdf1')
    const frame = w.find('iframe')
    expect(frame.exists()).toBe(true)
    expect(frame.attributes('src')).toBe('blob:pdf1')
  })

  it('opens a native PDF by loading the source itself (no pdf rendition)', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png') }) // no pdf rendition
    const w = mount(DocumentPreview, { props: { uid: 'src-uid', name: 'manual.pdf' } })
    await flushPromises()

    await w.find('.btn').trigger('click')
    await flushPromises()

    expect(renditionObjectUrl).toHaveBeenCalledWith('src-uid') // the source is the PDF
    expect(w.find('iframe').attributes('src')).toBe('blob:src-uid')
  })

  it('offers no PDF action for a non-PDF without a pdf rendition (e.g. an image)', async () => {
    loadRenditionSet.mockResolvedValue({ preview: ref_('p1', 'preview', 'png') })
    const w = mount(DocumentPreview, { props: { uid: 'f1', name: 'photo.png' } })
    await flushPromises()
    expect(w.find('.btn').exists()).toBe(false)
    expect(w.find('img.dp-img').exists()).toBe(true)
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

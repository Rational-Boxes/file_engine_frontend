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
  // Faithful reimpl: a playable clip arrives as the `preview` rendition.
  isVideoRef: (r?: { ext: string }) =>
    !!r && ['mp4', 'webm', 'ogg', 'mov'].includes(r.ext.toLowerCase()),
  // Faithful reimpl: the preview still is a PNG preview, else a video poster.
  previewImage: (set: { preview?: { ext: string }; poster?: unknown; thumbnail?: { ext: string } }) => {
    const isImg = (r?: { ext: string }) => !!r && ['png', 'webp', 'jpg', 'jpeg', 'gif'].includes(r.ext)
    if (isImg(set?.preview)) return set.preview
    return set?.poster ?? (isImg(set?.thumbnail) ? set.thumbnail : undefined)
  },
}))
vi.mock('@/services/searchService', () => ({ searchService: { generatePreview } }))
const { downloadFile, downloadUrl, checkPermission, playbackUrl } = vi.hoisted(() => ({
  downloadFile: vi.fn(),
  downloadUrl: vi.fn(),
  checkPermission: vi.fn(),
  playbackUrl: vi.fn(),
}))
vi.mock('@/services/fileService', () => ({
  fileService: { downloadFile, downloadUrl, checkPermission, playbackUrl },
}))
const { open, close } = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn() }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open, close }) }))
// A comparison requested elsewhere reaches this surface through the difference
// store; idle (no uid) is the state every test here cares about.
vi.mock('@/stores/difference', () => ({
  useDifferenceStore: () => ({ uid: '', name: '', target: '', base: '', close: vi.fn() }),
}))
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }), useRoute: () => ({ query: {} }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ tenant: 'default' }) }))
// The discussion children are exercised by their own tests; stub them here so the
// preview tests stay focused (and don't pull in the discussion service / WS).
vi.mock('@/components/ThreadPanel.vue', () => ({ default: {
  name: 'ThreadPanel',
  props: ['activeCommentId', 'activeThreadId', 'substituteActive', 'fileUid', 'focusComment', 'focusThread'],
  emits: ['show-markup', 'show-diff', 'restore-plain', 'layout', 'update:pos'],
  render: () => null,
} }))
vi.mock('@/components/ThreadOverlay.vue', () => ({ default: { name: 'ThreadOverlay', render: () => null } }))
// The PDF.js viewer (Phase 7.1) dynamic-imports pdfjs internally; stub it and expose
// its `src`/`editable` props so the preview tests can assert what the viewer is
// pointed at without loading pdfjs.
vi.mock('@/components/PdfViewer.vue', () => ({
  default: {
    name: 'PdfViewer',
    props: ['src', 'editable', 'fullWidth'],
    emits: ['ready', 'error', 'dirty', 'has-markup', 'download'],
    // Stand in for the exposed viewer API the preview calls when baking markup into a
    // download. hasEdits stays false; tests drive "markup present" via the has-markup
    // emit (→ pdfHasMarkup), the same signal the real viewer sends.
    methods: {
      saveBytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      hasEdits: () => false,
      markSaved: () => {},
    },
    render(this: { src: string; editable: boolean }) {
      return h('div', { class: 'pv-stub', 'data-src': this.src, 'data-editable': String(this.editable) })
    },
  },
}))

// The deployment's convertible formats, set per test.
const caps = vi.hoisted(() => ({ known: true, previewExtensions: ['docx', 'txt', 'png'] as string[] }))
vi.mock('@/composables/useCapabilities', async () => {
  const { computed, reactive } = await import('vue')
  return {
    useCapabilities: () => ({
      features: reactive({ discussion: false, difference: false, media: false }),
      ready: computed(() => true),
      conversionFormats: computed(() => ({ known: caps.known, previewExtensions: caps.previewExtensions })),
    }),
  }
})

import DocumentPreview from '@/components/DocumentPreview.vue'

const ref_ = (uid: string, fmt: string, ext: string) => ({ uid, name: `v-${fmt}.${ext}`, fmt, ext, version: 'v' })


// Files without a preview: conversion is offered only where an installed plugin
// can render the format; everything else gets its type and a download.
describe('DocumentPreview — files without a preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    caps.known = true
    caps.previewExtensions = ['docx', 'txt', 'png']
    loadRenditionSet.mockResolvedValue({})
    checkPermission.mockResolvedValue(false)
    renditionObjectUrl.mockImplementation((uid: string) => Promise.resolve('blob:' + uid))
    downloadUrl.mockResolvedValue('https://bridge/x?t=1')
  })

  const mountFor = (name: string, extra: Record<string, unknown> = {}) =>
    mount(DocumentPreview, { props: { uid: 'f1', name, fullWidth: true, showLocation: true, ...extra } })

  it('offers conversion for a format a plugin here can render', async () => {
    const w = mountFor('report.docx')
    await flushPromises()
    expect(w.find('[data-test="generate-preview"]').exists()).toBe(true)
    expect(w.text()).toContain('Download original')
  })

  it('offers a download, not a conversion, for an executable', async () => {
    const w = mountFor('setup.exe')
    await flushPromises()
    expect(w.find('[data-test="generate-preview"]').exists()).toBe(false)
    expect(w.find('[data-test="no-preview"]').text()).toContain("Programs and installers can't be previewed")
    expect(w.find('[data-test="no-preview"]').text()).toContain('⚙️')
    expect(w.find('[data-test="download-original"]').exists()).toBe(true)
    expect(w.text()).toContain('Open file location')
  })

  it('never offers conversion for an archive, even before the deployment has answered', async () => {
    caps.known = false
    const w = mountFor('backup.tar.gz')
    await flushPromises()
    expect(w.find('[data-test="generate-preview"]').exists()).toBe(false)
    expect(w.find('[data-test="no-preview"]').text()).toContain("Archives can't be previewed")
  })

  it('offers a download for a format nothing installed converts', async () => {
    const w = mountFor('song.mp3')
    await flushPromises()
    expect(w.find('[data-test="generate-preview"]').exists()).toBe(false)
    expect(w.find('[data-test="no-preview"]').text()).toContain("Audio files can't be previewed")
  })

  it('keeps offering conversion when the deployment has not reported its formats', async () => {
    caps.known = false
    const w = mountFor('notes.xyz')
    await flushPromises()
    expect(w.find('[data-test="generate-preview"]').exists()).toBe(true)
  })

  it('downloads the original from the no-preview state', async () => {
    const w = mountFor('tool.bin')
    await flushPromises()
    await w.find('[data-test="download-original"]').trigger('click')
    await flushPromises()
    expect(downloadUrl).toHaveBeenCalledWith('f1')
  })

  it('stops offering conversion once the converter says the type is unsupported', async () => {
    generatePreview.mockResolvedValue({ status: 'unsupported', renditions: [], hasMarkdown: false })
    const w = mountFor('notes.txt')
    await flushPromises()
    await w.find('[data-test="generate-preview"]').trigger('click')
    await flushPromises()
    expect(generatePreview).toHaveBeenCalledWith('f1')
    expect(w.find('[data-test="generate-preview"]').exists()).toBe(false)
    expect(w.find('[data-test="no-preview"]').text()).toContain('No converter here supports this file type')
    expect(w.find('[data-test="download-original"]').exists()).toBe(true)
  })

  it('says so when a conversion finishes with nothing to show', async () => {
    generatePreview.mockResolvedValue({ status: 'indexed', renditions: [], hasMarkdown: true })
    const w = mountFor('notes.txt')
    await flushPromises()
    await w.find('[data-test="generate-preview"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="no-preview"]').text()).toContain('The conversion produced no preview')
  })

  it('converts at once when opened to generate, and shows the result', async () => {
    loadRenditionSet
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ preview: ref_('p1', 'preview', 'png') })
    generatePreview.mockResolvedValue({ status: 'converted', renditions: ['v-preview.png'], hasMarkdown: true })
    const w = mountFor('report.docx', { autoGenerate: true })
    await flushPromises()
    expect(generatePreview).toHaveBeenCalledWith('f1')
    expect(w.find('img.dp-img').attributes('src')).toBe('blob:p1')
  })

  it('does not auto-convert a format that cannot be converted', async () => {
    const w = mountFor('setup.exe', { autoGenerate: true })
    await flushPromises()
    expect(generatePreview).not.toHaveBeenCalled()
    expect(w.find('[data-test="no-preview"]').exists()).toBe(true)
  })
})

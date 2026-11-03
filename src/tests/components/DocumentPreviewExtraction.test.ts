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

// The extraction view: a version AI extraction has values for opens on the
// marked-up PDF csai wrote, read-only, with the values beside it; the reader can
// go back to the (annotatable) document and return.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const { forDocument, renditionObjectUrl, loadRenditionSet, checkPermission } = vi.hoisted(() => ({
  forDocument: vi.fn(),
  renditionObjectUrl: vi.fn(async (uid: string) => `blob:${uid}`),
  loadRenditionSet: vi.fn(),
  checkPermission: vi.fn().mockResolvedValue(true),
}))
const { goToPage } = vi.hoisted(() => ({ goToPage: vi.fn() }))

vi.mock('@/services/extractionService', async (orig) => ({
  ...(await orig<typeof import('@/services/extractionService')>()),
  extractionService: { forDocument },
}))
vi.mock('@/services/differenceService', () => ({ differenceService: { getWhenReady: vi.fn() } }))
vi.mock('@/stores/difference', () => ({
  useDifferenceStore: () => ({ uid: '', name: '', target: '', base: '', close: vi.fn() }),
}))
vi.mock('@/stores/model3d', () => ({ useModel3dStore: () => ({ open: vi.fn() }) }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open: vi.fn(), close: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ tenant: 'default' }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ query: {} }) }))
vi.mock('@/services/renditions', () => ({
  loadRenditionSet,
  renditionObjectUrl,
  renditionText: vi.fn(),
  revokeRenditionUrl: vi.fn(),
  previewImage: (set: { preview?: unknown }) => set?.preview,
}))
vi.mock('@/services/searchService', () => ({ searchService: { generatePreview: vi.fn() } }))
vi.mock('@/services/fileService', () => ({ fileService: { downloadFile: vi.fn(), checkPermission } }))
vi.mock('@/services/apiClient', () => ({ errorMessage: (_e: unknown, m: string) => m }))
vi.mock('@/components/ThreadPanel.vue', () => ({ default: { name: 'ThreadPanel', render: () => null } }))
vi.mock('@/components/ThreadOverlay.vue', () => ({ default: { name: 'ThreadOverlay', render: () => null } }))
vi.mock('@/components/VersionPairPicker.vue', () => ({ default: { name: 'VersionPairPicker', render: () => null } }))
vi.mock('@/components/DiffPageViewer.vue', () => ({ default: { name: 'DiffPageViewer', render: () => null } }))
vi.mock('@/components/PdfViewer.vue', () => ({
  default: {
    name: 'PdfViewer',
    props: ['src', 'editable'],
    methods: { goToPage },
    render(this: { src: string; editable: boolean }) {
      return h('div', { class: 'pv-stub', 'data-src': this.src, 'data-editable': String(!!this.editable) })
    },
  },
}))

import DocumentPreview from '@/components/DocumentPreview.vue'

const ENTRY = {
  entry: 'k1',
  prompt_set: { id: 'ps_door', revision: 2, name: 'Door datasheet' },
  model: 'qwen',
  created_at: '2026-11-03T10:00:00Z',
  fields: [
    { name: 'fire_rating', type: 'string', label: 'Fire resistance' },
    { name: 'width_mm', type: 'number', label: 'Width', unit: 'mm' },
    { name: 'epd', type: 'string', label: 'EPD number' },
  ],
  data: {
    fire_rating: { found: true, value: 'EI 60', unit: null, evidence: { quote: 'Fire rating EI 60', offset: 4 } },
    width_mm: { found: true, value: 926, unit: 'mm', evidence: { quote: 'width 926', offset: 90 } },
    epd: { found: false, value: null, unit: null, evidence: null },
  },
  markup: {
    uid: 'xpdf1',
    name: 'v1-extractpdf_door.pdf',
    fields: { fire_rating: { located: true, page: 2 }, width_mm: { located: false, reason: 'not_located' } },
    colours: { fire_rating: '#ff0000', width_mm: '#00ff00', epd: '#0000ff' },
  },
}

function surface() {
  return mount(DocumentPreview, { props: { uid: 'f1', name: 'door.pdf', fullWidth: true } })
}

beforeEach(() => {
  vi.clearAllMocks()
  loadRenditionSet.mockResolvedValue({ extract: { uid: 'x1', ext: 'json', fmt: 'extract', version: 'v1' } })
  forDocument.mockResolvedValue({ file_uid: 'f1', version: 'v1', entries: [ENTRY] })
})

describe('the extraction view', () => {
  it('opens on the marked-up PDF, read-only, with the values beside it', async () => {
    const w = surface()
    await flushPromises()
    const pv = w.get('.pv-stub')
    expect(pv.attributes('data-src')).toBe('blob:xpdf1')
    expect(pv.attributes('data-editable')).toBe('false')
    // the document's own PDF is not fetched until the reader goes back to it
    expect(renditionObjectUrl).not.toHaveBeenCalledWith('f1', 'application/pdf')
    const rows = w.findAll('.xs-row')
    expect(rows.map((r) => r.attributes('data-field'))).toEqual(['fire_rating', 'width_mm', 'epd'])
    expect(rows[0].text()).toContain('EI 60')
    expect(rows[1].text()).toContain('926 mm')
    expect(rows[1].text()).toContain('Not marked in the PDF')
    expect(rows[2].text()).toContain('Not found')
  })

  it('jumps to the page a value was found on', async () => {
    const w = surface()
    await flushPromises()
    await w.get('.xs-page').trigger('click')
    expect(goToPage).toHaveBeenCalledWith(2)
  })

  it('goes back to the annotatable document and returns', async () => {
    const w = surface()
    await flushPromises()
    await w.get('[data-test="extract-back"]').trigger('click')
    await flushPromises()
    expect(w.get('.pv-stub').attributes('data-src')).toBe('blob:f1')
    expect(w.get('.pv-stub').attributes('data-editable')).toBe('true')
    expect(w.find('.xs').exists()).toBe(false)
    await w.get('[data-test="extract-open"]').trigger('click')
    expect(w.get('.pv-stub').attributes('data-src')).toBe('blob:xpdf1')
    expect(w.find('.xs').exists()).toBe(true)
  })

  it('without a marked-up copy shows the plain document beside the values, still read-only', async () => {
    forDocument.mockResolvedValue({ file_uid: 'f1', version: 'v1', entries: [{ ...ENTRY, markup: null }] })
    const w = surface()
    await flushPromises()
    expect(w.get('.pv-stub').attributes('data-src')).toBe('blob:f1')
    expect(w.get('.pv-stub').attributes('data-editable')).toBe('false')
    expect(w.find('[data-test="no-markup"]').exists()).toBe(true)
  })

  it('is not offered without a sidecar, or when csai has nothing for this version', async () => {
    loadRenditionSet.mockResolvedValue({})
    let w = surface()
    await flushPromises()
    expect(forDocument).not.toHaveBeenCalled()
    expect(w.find('.xs').exists()).toBe(false)

    loadRenditionSet.mockResolvedValue({ extract: { uid: 'x1', ext: 'json', fmt: 'extract', version: 'v0' } })
    forDocument.mockRejectedValue(new Error('csai down'))
    w = surface()
    await flushPromises()
    expect(w.get('.pv-stub').attributes('data-src')).toBe('blob:f1')
    expect(w.find('[data-test="extract-open"]').exists()).toBe(false)
  })

  it('offers each prompt set when several extracted this version', async () => {
    const other = { ...ENTRY, entry: 'k2', prompt_set: { id: 'ps_epd', revision: 1, name: 'EPD' },
      markup: { ...ENTRY.markup, uid: 'xpdf2' } }
    forDocument.mockResolvedValue({ file_uid: 'f1', version: 'v1', entries: [ENTRY, other] })
    const w = surface()
    await flushPromises()
    await w.get('.xs-pick').setValue('1')
    await flushPromises()
    expect(w.get('.pv-stub').attributes('data-src')).toBe('blob:xpdf2')
  })
})

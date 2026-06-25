import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { stat } = vi.hoisted(() => ({ stat: vi.fn() }))
vi.mock('@/services/fileService', () => ({ fileService: { stat } }))
// DocumentPreview is exercised in its own suite; stub it here.
vi.mock('@/components/DocumentPreview.vue', () => ({
  default: { name: 'DocumentPreview', props: ['uid', 'name', 'fullWidth'], template: '<div class="dp-stub" />' },
}))

import PdfPreviewOverlay from '@/components/PdfPreviewOverlay.vue'
import { usePreviewStore } from '@/stores/preview'

const mountOverlay = () =>
  mount(PdfPreviewOverlay, { global: { stubs: { teleport: true } } })

describe('PdfPreviewOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    stat.mockResolvedValue({ name: 'report.pdf' })
  })

  it('is hidden until the preview store is opened', async () => {
    const w = mountOverlay()
    expect(w.find('.ov-backdrop').exists()).toBe(false)

    usePreviewStore().open('f1', 'report.pdf')
    await flushPromises()
    expect(w.find('.ov-backdrop').exists()).toBe(true)
    expect(w.find('.ov-title').text()).toBe('report.pdf')
    expect(w.find('.dp-stub').exists()).toBe(true)
  })

  it('looks up the name when opened without one', async () => {
    const w = mountOverlay()
    usePreviewStore().open('f1') // no name
    await flushPromises()
    expect(stat).toHaveBeenCalledWith('f1')
    expect(w.find('.ov-title').text()).toBe('report.pdf')
  })

  it('closes via the ✕ button (overlay only — no navigation)', async () => {
    const store = usePreviewStore()
    const w = mountOverlay()
    store.open('f1', 'report.pdf')
    await flushPromises()

    await w.find('.ov-x').trigger('click')
    expect(store.isOpen).toBe(false)
    expect(w.find('.ov-backdrop').exists()).toBe(false)
  })
})

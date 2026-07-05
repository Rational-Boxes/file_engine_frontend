import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { stat } = vi.hoisted(() => ({ stat: vi.fn() }))

vi.mock('@/services/fileService', () => ({ fileService: { stat } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { uid: 'f1' } }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}))

import PreviewView from '@/views/PreviewView.vue'
import { useModel3dStore } from '@/stores/model3d'

const mountView = () =>
  mount(PreviewView, {
    global: { stubs: { AppNav: true, DocumentPreview: true, ThreadPanel: true } },
  })

describe('PreviewView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads the file name for the route uid and renders the preview', async () => {
    stat.mockResolvedValue({ uid: 'f1', name: 'report.pdf' })
    const w = mountView()
    await flushPromises()
    expect(stat).toHaveBeenCalledWith('f1')
    expect(w.text()).toContain('report.pdf')
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(true)
  })

  it('opens the 3D viewer overlay for a model file (not DocumentPreview)', async () => {
    stat.mockResolvedValue({ uid: 'f1', name: 'tower.ifc' })
    const w = mountView()
    await flushPromises()
    expect(useModel3dStore().isOpen).toBe(true)
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(false)
  })
})

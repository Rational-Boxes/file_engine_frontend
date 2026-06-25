import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { stat } = vi.hoisted(() => ({ stat: vi.fn() }))

vi.mock('@/services/fileService', () => ({ fileService: { stat } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { uid: 'f1' } }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}))

import PreviewView from '@/views/PreviewView.vue'

const mountView = () =>
  mount(PreviewView, {
    global: { stubs: { AppNav: true, DocumentPreview: true } },
  })

describe('PreviewView', () => {
  beforeEach(() => {
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
})

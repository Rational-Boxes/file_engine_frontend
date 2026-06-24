import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { stat } = vi.hoisted(() => ({ stat: vi.fn() }))
const { getText } = vi.hoisted(() => ({ getText: vi.fn() }))

vi.mock('@/services/fileService', () => ({ fileService: { stat } }))
vi.mock('@/services/searchService', () => ({ searchService: { getText } }))
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

  it('loads the file name and extracted text for the route uid', async () => {
    stat.mockResolvedValue({ uid: 'f1', name: 'report.pdf' })
    getText.mockResolvedValue({ text: '# Northern Region', truncated: false })
    const w = mountView()
    await flushPromises()
    expect(stat).toHaveBeenCalledWith('f1')
    expect(getText).toHaveBeenCalledWith('f1')
    expect(w.text()).toContain('report.pdf')
    expect(w.text()).toContain('# Northern Region')
  })

  it('still renders when there is no extracted text (404)', async () => {
    stat.mockResolvedValue({ uid: 'f1', name: 'photo.png' })
    getText.mockRejectedValue(new Error('404'))
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('photo.png')
    expect(w.find('.text-pane').exists()).toBe(false)
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(true)
  })
})

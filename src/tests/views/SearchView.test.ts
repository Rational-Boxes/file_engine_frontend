import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { search } = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('@/services/searchService', () => ({ searchService: { search } }))
vi.mock('@/services/csaiClient', () => ({ errorMessage: (e: unknown) => String(e) }))
const { open } = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open }) }))
const { m3dOpen } = vi.hoisted(() => ({ m3dOpen: vi.fn() }))
vi.mock('@/stores/model3d', () => ({ useModel3dStore: () => ({ open: m3dOpen }) }))

import SearchView from '@/views/SearchView.vue'

const mountView = () => mount(SearchView, { global: { stubs: { AppNav: true } } })

describe('SearchView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches and renders hits', async () => {
    search.mockResolvedValue([{ fileUid: 'f1', name: 'a.md', snippet: '…north…', score: 0.91 }])
    const w = mountView()
    await w.find('input').setValue('north')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(search).toHaveBeenCalledWith('north', { limit: 50 })
    expect(w.text()).toContain('a.md')
    expect(w.text()).toContain('…north…')
    expect(w.text()).toContain('0.91')
    // clicking a document result raises the document preview overlay
    await w.find('.result-link').trigger('click')
    expect(open).toHaveBeenCalledWith('f1', 'a.md')
    expect(m3dOpen).not.toHaveBeenCalled()
  })

  it('a 3D-model result shows a format icon and opens the 3D viewer (not the doc preview)', async () => {
    search.mockResolvedValue([{ fileUid: 'm1', name: 'tower.ifc', snippet: '…IfcWall…', score: 0.8 }])
    const w = mountView()
    await w.find('input').setValue('wall')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('🏗️') // IFC icon
    expect(w.text()).toContain('…IfcWall…') // extracted text snippet
    await w.find('.result-link').trigger('click')
    expect(m3dOpen).toHaveBeenCalledWith('m1', 'tower.ifc')
    expect(open).not.toHaveBeenCalled() // never the document preview
  })

  it('shows "No results" when the search is empty', async () => {
    search.mockResolvedValue([])
    const w = mountView()
    await w.find('input').setValue('zzz')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('No results')
  })

  it('surfaces an error message on failure', async () => {
    search.mockRejectedValue(new Error('boom'))
    const w = mountView()
    await w.find('input').setValue('q')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('boom')
  })
})

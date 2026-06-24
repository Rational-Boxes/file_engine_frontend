import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'

const { search } = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('@/services/searchService', () => ({ searchService: { search } }))
vi.mock('@/services/csaiClient', () => ({ errorMessage: (e: unknown) => String(e) }))

import SearchView from '@/views/SearchView.vue'

const mountView = () =>
  mount(SearchView, { global: { stubs: { AppNav: true, RouterLink: RouterLinkStub } } })

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
    // result deep-links to the standalone preview
    expect(w.findComponent(RouterLinkStub).props('to')).toBe('/preview/f1')
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

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

const { search } = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('@/services/searchService', () => ({ searchService: { search } }))
vi.mock('@/services/csaiClient', () => ({ errorMessage: (e: unknown) => String(e) }))
const { open } = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open }) }))
const { m3dOpen } = vi.hoisted(() => ({ m3dOpen: vi.fn() }))
vi.mock('@/stores/model3d', () => ({ useModel3dStore: () => ({ open: m3dOpen }) }))

import SearchView from '@/views/SearchView.vue'

const mountView = () => mount(SearchView, { global: { stubs: { AppNav: true, HelpIcon: true } } })

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

  it('renders Markdown in the snippet as HTML, not raw syntax', async () => {
    search.mockResolvedValue([
      { fileUid: 'f1', name: 'spec.md', snippet: '## Heading\n\n- **bold** item\n- second', score: 0.7 },
    ])
    const w = mountView()
    await w.find('input').setValue('x')
    await w.find('form').trigger('submit')
    await flushPromises()
    const html = w.find('.result-snippet').html()
    expect(html).toContain('<h2')
    expect(html).toContain('<ul')
    expect(html).toContain('<strong>bold</strong>')
    // raw markdown markers are not shown as text
    expect(w.find('.result-snippet').text()).not.toContain('##')
  })

  it('shows "No results" when the search is empty', async () => {
    search.mockResolvedValue([])
    const w = mountView()
    await w.find('input').setValue('zzz')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('No results')
  })

  it('runs the search on Enter in the input', async () => {
    search.mockResolvedValue([{ fileUid: 'f1', name: 'a.md', snippet: '…north…', score: 0.9 }])
    const w = mountView()
    await w.find('input').setValue('north')
    await w.find('input').trigger('keydown.enter')
    await flushPromises()
    expect(search).toHaveBeenCalledWith('north', { limit: 50 })
    expect(w.text()).toContain('a.md')
  })

  it('the clear ✕ resets the query and results', async () => {
    search.mockResolvedValue([{ fileUid: 'f1', name: 'a.md', snippet: '…north…', score: 0.9 }])
    const w = mountView()
    await w.find('input').setValue('north')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('a.md')
    await w.find('.clear-x').trigger('click')
    expect((w.find('input').element as HTMLInputElement).value).toBe('')
    expect(w.text()).not.toContain('a.md') // results cleared
    expect(w.find('.clear-x').exists()).toBe(false) // hidden once empty
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

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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { renditionText } = vi.hoisted(() => ({ renditionText: vi.fn() }))

vi.mock('@/services/renditions', () => ({ renditionText }))
vi.mock('@/services/apiClient', () => ({ errorMessage: (_e: unknown, m: string) => m }))

import DiffPageViewer from '@/components/DiffPageViewer.vue'
import type { DiffChildRef, DiffMode } from '@/services/differenceService'

const SVG = (id: string) =>
  `<svg data-diff-mode="vector"><g id="diff-old"><path data-diff-state="deleted" d="M0,0"/></g>`
  + `<g id="diff-new"><path data-diff-state="added" d="M1,1"/></g>`
  + `<g id="diff-changes"><path data-diff-state="added" d="M1,1"/></g>`
  + `<!-- ${id} --></svg>`

function pages(n = 1, mode: DiffMode = 'vector'): DiffChildRef[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i, name: `p${i}.svg`, uid: `u${i}`, mode, kind: 'page',
  }))
}

beforeEach(() => {
  renditionText.mockReset()
  renditionText.mockImplementation(async (uid: string) => SVG(uid))
})

describe('page loading', () => {
  it('fetches and inlines the first page', async () => {
    const w = mount(DiffPageViewer, { props: { pages: pages(1) } })
    await flushPromises()
    expect(renditionText).toHaveBeenCalledWith('u0')
    expect(w.find('.dv-stage').html()).toContain('id="diff-changes"')
  })

  it('caches a page so flipping back does not refetch', async () => {
    const w = mount(DiffPageViewer, { props: { pages: pages(2) } })
    await flushPromises()
    await w.findAll('.dv-nav')[1].trigger('click')   // next
    await flushPromises()
    await w.findAll('.dv-nav')[0].trigger('click')   // back
    await flushPromises()
    expect(renditionText).toHaveBeenCalledTimes(2)   // u0, u1 — not u0 again
  })

  it('resets to the first page when a different comparison is shown', async () => {
    const w = mount(DiffPageViewer, { props: { pages: pages(3) } })
    await flushPromises()
    await w.findAll('.dv-nav')[1].trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Page 2 / 3')

    await w.setProps({ pages: pages(2) })
    await flushPromises()
    expect(w.text()).toContain('Page 1 / 2')
  })

  it('surfaces a load failure instead of rendering an empty page', async () => {
    renditionText.mockRejectedValue(new Error('nope'))
    const w = mount(DiffPageViewer, { props: { pages: pages(1) } })
    await flushPromises()
    expect(w.find('.dv-err').exists()).toBe(true)
  })
})

describe('the three-layer contract (§7.2)', () => {
  it('defaults to the difference view', async () => {
    const w = mount(DiffPageViewer, { props: { pages: pages(1) } })
    await flushPromises()
    expect(w.find('.dv-stage').classes()).toContain('view-difference')
  })

  it('switches view without refetching the page', async () => {
    // The whole point of shipping three layers in one SVG.
    const w = mount(DiffPageViewer, { props: { pages: pages(1) } })
    await flushPromises()
    const buttons = w.findAll('.dv-view')
    await buttons[0].trigger('click')                       // Before
    expect(w.find('.dv-stage').classes()).toContain('view-before')
    await buttons[1].trigger('click')                       // After
    expect(w.find('.dv-stage').classes()).toContain('view-after')
    expect(renditionText).toHaveBeenCalledTimes(1)
  })

  it('keeps the semantic state markup intact', async () => {
    // Colour is applied by CSS from these attributes; losing them loses the diff.
    const w = mount(DiffPageViewer, { props: { pages: pages(1) } })
    await flushPromises()
    const html = w.find('.dv-stage').html()
    expect(html).toContain('data-diff-state="added"')
    expect(html).toContain('data-diff-state="deleted"')
  })
})

describe('per-page mode', () => {
  it('labels a scanned page so the reader knows why it looks different', async () => {
    const w = mount(DiffPageViewer, { props: { pages: pages(1, 'raster') } })
    await flushPromises()
    expect(w.find('.dv-mode').text()).toBe('scanned')
  })

  it('a mixed document labels each page independently', async () => {
    const w = mount(DiffPageViewer, {
      props: { pages: [pages(1, 'vector')[0], { ...pages(1, 'raster')[0], index: 1, uid: 'u1' }] },
    })
    await flushPromises()
    expect(w.find('.dv-mode').text()).toBe('vector')
    await w.findAll('.dv-nav')[1].trigger('click')
    await flushPromises()
    expect(w.find('.dv-mode').text()).toBe('scanned')
  })

  it('an unavailable page says so rather than showing a blank page', async () => {
    // A blank page reads as "nothing changed here", which would be a lie.
    const w = mount(DiffPageViewer, { props: { pages: pages(1, 'unavailable') } })
    await flushPromises()
    expect(w.find('.dv-unavailable').exists()).toBe(true)
    expect(renditionText).not.toHaveBeenCalled()
  })
})

describe('navigation', () => {
  it('hides paging for a single-page result', async () => {
    const w = mount(DiffPageViewer, { props: { pages: pages(1) } })
    await flushPromises()
    expect(w.find('.dv-pages').exists()).toBe(false)
  })

  it('disables the arrows at each end', async () => {
    const w = mount(DiffPageViewer, { props: { pages: pages(2) } })
    await flushPromises()
    const [prev, next] = w.findAll('.dv-nav')
    expect(prev.attributes('disabled')).toBeDefined()
    await next.trigger('click')
    await flushPromises()
    expect(w.findAll('.dv-nav')[1].attributes('disabled')).toBeDefined()
  })
})

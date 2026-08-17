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
    expect(w.find('.dv-canvas').classes()).toContain('view-difference')
  })

  it('switches view without refetching the page', async () => {
    // The whole point of shipping three layers in one SVG.
    const w = mount(DiffPageViewer, { props: { pages: pages(1) } })
    await flushPromises()
    const buttons = w.findAll('.dv-view')
    await buttons[0].trigger('click')                       // Before
    expect(w.find('.dv-canvas').classes()).toContain('view-before')
    await buttons[1].trigger('click')                       // After
    expect(w.find('.dv-canvas').classes()).toContain('view-after')
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


// Zoom and pan are what make a vector comparison usable on an engineering
// drawing: at fit-width a B1 sheet's dimension text is a few pixels tall, so the
// changed callout is legible only close up.
describe('zoom and pan', () => {
  // jsdom reports every element as 0x0; the pan clamp reads these, so give the
  // stage a real size or every pan is clamped to nothing.
  function sized(w: ReturnType<typeof mount>) {
    const stage = w.get('.dv-stage').element as HTMLElement
    Object.defineProperty(stage, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(stage, 'clientHeight', { value: 600, configurable: true })
    Object.defineProperty(stage, 'scrollHeight', { value: 600, configurable: true })
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect
    return stage
  }

  function wheel(el: Element, deltaY: number, clientX: number, clientY: number) {
    el.dispatchEvent(new WheelEvent('wheel',
      { deltaY, clientX, clientY, bubbles: true, cancelable: true }))
  }

  // jsdom has no PointerEvent; a MouseEvent of the same type carries everything
  // the handlers read (button, clientX/Y) and the capture calls are stubbed.
  function pointer(el: Element, type: string, clientX: number, clientY: number) {
    el.dispatchEvent(new MouseEvent(type, { button: 0, clientX, clientY, bubbles: true }))
  }

  function pan(w: ReturnType<typeof mount>) {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(transform(w))!
    return { x: Number(m[1]), y: Number(m[2]) }
  }

  function transform(w: ReturnType<typeof mount>) {
    return (w.get('.dv-canvas').element as HTMLElement).style.transform
  }

  async function viewer() {
    const w = mount(DiffPageViewer, { props: { pages: pages(2) } })
    await flushPromises()
    sized(w)
    return w
  }

  it('starts fitted to the window', async () => {
    const w = await viewer()
    expect(w.get('.dv-zoom-lbl').text()).toBe('100%')
    expect(transform(w)).toContain('scale(1)')
  })

  it('zooms in and out from the toolbar', async () => {
    const w = await viewer()
    await w.get('[aria-label="Zoom in"]').trigger('click')
    expect(w.get('.dv-zoom-lbl').text()).toBe('125%')
    await w.get('[aria-label="Zoom out"]').trigger('click')
    expect(w.get('.dv-zoom-lbl').text()).toBe('100%')
  })

  it('will not zoom out past the whole page', async () => {
    // Below fit there is nothing more to see, and shrinking the sheet into a
    // corner of a grey field is not a view anyone asked for.
    const w = await viewer()
    await w.get('[aria-label="Zoom out"]').trigger('click')
    expect(transform(w)).toContain('scale(1)')
  })

  it('keeps the point under the cursor fixed while wheel-zooming', async () => {
    const w = await viewer()
    // Zoom about the top-left corner: the origin does not move, so no pan is
    // needed. Anywhere else and the pan must compensate.
    wheel(w.get('.dv-stage').element, -100, 0, 0)
    await flushPromises()
    expect(transform(w)).toContain('translate(0px, 0px)')

    const zoomed = w.get('.dv-zoom-lbl').text()
    wheel(w.get('.dv-stage').element, -100, 400, 300)
    await flushPromises()
    expect(w.get('.dv-zoom-lbl').text()).not.toBe(zoomed)
    expect(transform(w)).not.toContain('translate(0px, 0px)')
  })

  it('drags to pan once there is something to pan', async () => {
    const w = await viewer()
    await w.get('[aria-label="Zoom in"]').trigger('click')
    const stage = w.get('.dv-stage').element as HTMLElement
    stage.setPointerCapture = () => {}
    stage.releasePointerCapture = () => {}

    // Zooming from the toolbar centres on the viewport, so the pan is already
    // non-zero here. What a drag must guarantee is the DELTA: the drawing moves
    // exactly with the pointer, or it feels like it is sliding on ice.
    const before = pan(w)
    pointer(stage, 'pointerdown', 400, 300)
    pointer(stage, 'pointermove', 350, 260)
    await flushPromises()
    expect(pan(w)).toEqual({ x: before.x - 50, y: before.y - 40 })
    pointer(stage, 'pointerup', 350, 260)
  })

  it('does not pan while the whole page is showing', async () => {
    const w = await viewer()
    const stage = w.get('.dv-stage').element as HTMLElement
    pointer(stage, 'pointerdown', 400, 300)
    pointer(stage, 'pointermove', 200, 100)
    await flushPromises()
    expect(transform(w)).toContain('translate(0px, 0px)')
  })

  it('returns to fit on demand', async () => {
    const w = await viewer()
    wheel(w.get('.dv-stage').element, -400, 400, 300)
    await flushPromises()
    await w.get('.dv-fit').trigger('click')
    expect(transform(w)).toContain('scale(1)')
    expect(transform(w)).toContain('translate(0px, 0px)')
  })

  it('keeps the zoom when stepping pages', async () => {
    // A reviewer checking the same detail across sheets should not have to zoom
    // back in on every page.
    const w = await viewer()
    await w.get('[aria-label="Zoom in"]').trigger('click')
    await w.findAll('.dv-nav').find((b) => b.text() === '›')!.trigger('click')
    await flushPromises()
    expect(w.get('.dv-zoom-lbl').text()).toBe('125%')
  })

  it('reports the viewport so a comment can point at a detail', async () => {
    const w = await viewer()
    await w.get('[aria-label="Zoom in"]').trigger('click')
    const last = w.emitted('state')!.at(-1)![0] as Record<string, number>
    expect(last).toMatchObject({ page: 0, view: 'difference', zoom: 1.25 })
  })

  it('restores a captured viewport rather than landing on the whole sheet', async () => {
    const w = mount(DiffPageViewer, {
      props: { pages: pages(3), initialPage: 1, initialView: 'after', initialZoom: 4, initialPanX: -120, initialPanY: -80 },
    })
    await flushPromises()
    expect(w.get('.dv-canvas').classes()).toContain('view-after')
    expect((w.get('.dv-canvas').element as HTMLElement).style.transform)
      .toBe('translate(-120px, -80px) scale(4)')
  })
})

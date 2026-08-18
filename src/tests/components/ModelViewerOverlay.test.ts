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
import { defineComponent, h as createEl } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const hh = vi.hoisted(() => ({
  loadRenditionSet: vi.fn(),
  modelRendition: vi.fn(),
  metamodelRendition: vi.fn(() => undefined),
  resizeSpy: vi.fn(),
  resetCameraSpy: vi.fn(),
  downloadFile: vi.fn(),
  push: vi.fn(),
  // Deep-link (§9): a mutable fake route the overlay reads via useRoute().
  route: { query: {} as Record<string, unknown> },
  // Viewer imperative API spies (the overlay drives these).
  setViewpoint: vi.fn(),
  highlightObjects: vi.fn(),
  // By default every tagged id resolves (present in the model); a test overrides
  // this to simulate a drifted anchor (id no longer in the re-converted model).
  resolveObjectIds: vi.fn((ids: string[]) => ids),
  renderAnnotations: vi.fn(),
  renderMeasurements: vi.fn(),
  captureViewpointAnchor: vi.fn(() => ({ kind: 'model-viewpoint' })),
  setNavMode: vi.fn(),
  addSectionPlane: vi.fn(() => 'sp1'),
  editSectionPlane: vi.fn(),
  clearXRay: vi.fn(),
  // ThreadPanel exposed methods.
  scrollToThread: vi.fn(),
  startAnnotation: vi.fn(),
  getWhenReady: vi.fn(),
}))

vi.mock('@/services/differenceService', () => ({ differenceService: { getWhenReady: hh.getWhenReady } }))
vi.mock('@/services/apiClient', () => ({ errorMessage: (_e: unknown, m: string) => m }))

vi.mock('@/services/renditions', () => ({
  loadRenditionSet: hh.loadRenditionSet,
  modelRendition: hh.modelRendition,
  metamodelRendition: hh.metamodelRendition,
}))
vi.mock('@/services/fileService', () => ({ fileService: { downloadFile: hh.downloadFile } }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: hh.push }),
  useRoute: () => hh.route,
}))

// Stub the heavy viewer (xeokit) — assert the overlay wires it, not WebGL.
vi.mock('@/components/Model3DViewer.vue', () => ({
  default: defineComponent({
    name: 'Model3DViewer',
    props: ['xktUid', 'metamodelUid', 'treeContainerId', 'navStep'],
    emits: ['annotation-activate', 'object-context'],
    setup(_, { expose }) {
      expose({
        resize: hh.resizeSpy,
        resetCamera: hh.resetCameraSpy,
        setViewpoint: hh.setViewpoint,
        highlightObjects: hh.highlightObjects,
        resolveObjectIds: hh.resolveObjectIds,
        renderAnnotations: hh.renderAnnotations,
        renderMeasurements: hh.renderMeasurements,
        captureViewpointAnchor: hh.captureViewpointAnchor,
        setNavMode: hh.setNavMode,
        addSectionPlane: hh.addSectionPlane,
        editSectionPlane: hh.editSectionPlane,
        clearXRay: hh.clearXRay,
      })
      return () => createEl('div', { class: 'm3d-stub' })
    },
  }),
}))

// Stub ThreadPanel (its live/discussion machinery is out of scope here) — expose
// the methods the overlay calls and let tests emit its events.
vi.mock('@/components/ThreadPanel.vue', () => ({
  default: defineComponent({
    name: 'ThreadPanel',
    props: ['fileUid', 'embedded', 'hideDock', 'pos'],
    emits: ['threads', 'restore-view', 'count', 'layout', 'update:pos'],
    setup(_, { expose }) {
      expose({ scrollToThread: hh.scrollToThread, startAnnotation: hh.startAnnotation })
      return () => createEl('div', { class: 'tp-stub' })
    },
  }),
}))

import ModelViewerOverlay from '@/components/ModelViewerOverlay.vue'
import { useModel3dStore } from '@/stores/model3d'

const mountOverlay = () => mount(ModelViewerOverlay, { global: { stubs: { teleport: true } } })

describe('ModelViewerOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    hh.route.query = {}
    localStorage.clear()
    document.body.style.overflow = ''
    hh.loadRenditionSet.mockResolvedValue({ model: { uid: 'xkt1' } })
    hh.modelRendition.mockImplementation((s: { model?: { uid: string } }) => s.model)
    hh.downloadFile.mockResolvedValue(new Blob(['x']))
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake')
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  it('is hidden until opened, then renders full-bleed and locks body scroll', async () => {
    const w = mountOverlay()
    expect(w.find('.mv-root').exists()).toBe(false)

    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()

    expect(w.find('.mv-root').exists()).toBe(true)
    expect(w.find('.mv-title').text()).toBe('tower.ifc')
    expect(w.find('.m3d-stub').exists()).toBe(true) // viewer mounted with resolved rendition
    expect(w.find('.mv-hint').exists()).toBe(true) // discrete Ctrl/⌘+click hint
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('shows a message when the file has no model rendition', async () => {
    hh.modelRendition.mockReturnValue(undefined)
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    expect(w.find('.mv-err').exists()).toBe(true)
    expect(w.find('.m3d-stub').exists()).toBe(false)
  })

  it('collapses/expands the sidebar and resizes the viewport on toggle', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()

    const side = w.find('.mv-side')
    const wasCollapsed = side.classes().includes('mv-side-collapsed')
    await w.find('.mv-toggle').trigger('click')
    await flushPromises()

    expect(w.find('.mv-side').classes().includes('mv-side-collapsed')).toBe(!wasCollapsed)
    expect(hh.resizeSpy).toHaveBeenCalled() // canvas told to recompute the viewport
  })

  it('closes via ✕ and Escape, restoring body scroll', async () => {
    const store = useModel3dStore()
    const w = mountOverlay()
    store.open('file1', 'tower.ifc')
    await flushPromises()

    await w.find('.mv-x').trigger('click')
    expect(store.isOpen).toBe(false)
    await flushPromises()
    expect(document.body.style.overflow).toBe('')
  })

  it('resets the camera to the default view from the tools panel', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    const reset = w
      .findAll('button')
      .find((b) => b.attributes('title') === 'Reset the camera to the default view')!
    expect(reset).toBeTruthy()
    await reset.trigger('click')
    expect(hh.resetCameraSpy).toHaveBeenCalled()
  })

  it('tabs the side panel between Objects and Tools (tree stays mounted)', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    expect(w.findAll('.mv-tab').map((t) => t.text())).toEqual(['Objects', 'Tools'])
    expect(w.find('#mv-object-tree').exists()).toBe(true) // tree present on the Objects tab
    await w.findAll('.mv-tab')[1].trigger('click') // → Tools
    await flushPromises()
    expect(w.findAll('.mv-tab')[1].classes()).toContain('mv-tab-on')
    expect(w.find('.mv-tools').exists()).toBe(true)
    expect(w.find('#mv-object-tree').exists()).toBe(true) // kept mounted (v-show), not detached
  })

  it('drives the viewer navigation step (zoom + pan) from the slider and persists it', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()

    // Halfway default: range 5..195 → 100 (xeokit's own default behaviour).
    expect(w.findComponent({ name: 'Model3DViewer' }).props('navStep')).toBe(100)

    await w.find('.mv-zoom-slider').setValue('30')
    await flushPromises()

    // Fed straight to the viewer, and remembered.
    expect(w.findComponent({ name: 'Model3DViewer' }).props('navStep')).toBe(30)
    expect(localStorage.getItem('fe.model3d.navStep')).toBe('30')
  })

  it('restores a persisted navigation step on open', async () => {
    localStorage.setItem('fe.model3d.navStep', '42')
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    expect(w.findComponent({ name: 'Model3DViewer' }).props('navStep')).toBe(42)
  })

  it('resets the navigation step to the halfway default, and disables reset when already there', async () => {
    localStorage.setItem('fe.model3d.navStep', '30')
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()

    const reset = w.find('.mv-zoom-reset')
    expect((reset.element as HTMLButtonElement).disabled).toBe(false) // off-default → enabled
    await reset.trigger('click')

    expect(w.findComponent({ name: 'Model3DViewer' }).props('navStep')).toBe(100)
    expect(localStorage.getItem('fe.model3d.navStep')).toBe('100')
    expect((w.find('.mv-zoom-reset').element as HTMLButtonElement).disabled).toBe(true) // at default → disabled
  })

  it('downloads the original source file', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    const dl = w.findAll('.mv-act').find((b) => b.text().includes('Download'))!
    await dl.trigger('click')
    await flushPromises()
    expect(hh.downloadFile).toHaveBeenCalledWith('file1') // the SOURCE uid, not the rendition
  })

  it('opens the file location (closes + navigates to the Files browser)', async () => {
    const store = useModel3dStore()
    const w = mountOverlay()
    store.open('file1', 'tower.ifc')
    await flushPromises()
    const loc = w.findAll('.mv-act').find((b) => b.text().includes('Open file location'))!
    await loc.trigger('click')
    expect(store.isOpen).toBe(false)
    expect(hh.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'FileBrowser', query: expect.objectContaining({ file: 'file1' }) }),
    )
  })

  // ---- annotation markers + deep-link (§9, Phase D part 2/3) ----------------
  const anchoredThread = (id: string, viewpoint: unknown, objectId?: string, measurements?: unknown[]) => ({
    id,
    anchor: {
      kind: 'model-viewpoint',
      viewpoint,
      object_refs: objectId ? [{ id: objectId }] : [],
      ...(measurements ? { measurements } : {}),
    },
  })

  it('renders a marker per anchored thread the panel surfaces', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    w.findComponent({ name: 'ThreadPanel' }).vm.$emit('threads', [
      anchoredThread('t1', { vp: 1 }),
      { id: 't2', anchor: null }, // plain comment — no marker
    ])
    await flushPromises()
    expect(hh.renderAnnotations).toHaveBeenCalledWith([
      expect.objectContaining({ id: 't1', threadId: 't1', viewpoint: { vp: 1 } }),
    ])
  })

  it('consumes a ?view&object deep-link: restores the viewpoint once threads load', async () => {
    hh.route.query = { view: 't1', object: 'wall-9' }
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    useModel3dStore().setReady(true) // the viewer signals it is live
    w.findComponent({ name: 'ThreadPanel' }).vm.$emit('threads', [anchoredThread('t1', { vp: 7 })])
    await flushPromises()
    expect(hh.setViewpoint).toHaveBeenCalledWith({ vp: 7 })
    expect(hh.highlightObjects).toHaveBeenCalledWith(['wall-9'])
    expect(hh.scrollToThread).toHaveBeenCalledWith('t1')
  })

  it('restore-view from the panel replays that thread’s viewpoint', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    useModel3dStore().setReady(true)
    const tp = w.findComponent({ name: 'ThreadPanel' })
    const measures = [{ type: 'distance', points: [{ pos: [0, 0, 0] }, { pos: [1, 0, 0] }], value: 1 }]
    tp.vm.$emit('threads', [anchoredThread('t2', { vp: 2 }, 'obj-42', measures)])
    tp.vm.$emit('restore-view', 't2')
    await flushPromises()
    expect(hh.setViewpoint).toHaveBeenCalledWith({ vp: 2 })
    expect(hh.highlightObjects).toHaveBeenCalledWith(['obj-42']) // tagged object selected
    expect(hh.renderMeasurements).toHaveBeenCalledWith(measures) // measurements re-drawn
    expect(hh.scrollToThread).toHaveBeenCalledWith('t2')
  })

  it('flags a drifted anchor: restores the view but does not select a missing element', async () => {
    // The tagged id no longer resolves (e.g. a non-IFC model was re-converted).
    hh.resolveObjectIds.mockReturnValueOnce([])
    const w = mountOverlay()
    useModel3dStore().open('file1', 'part.stp')
    await flushPromises()
    useModel3dStore().setReady(true)
    const tp = w.findComponent({ name: 'ThreadPanel' })
    tp.vm.$emit('threads', [anchoredThread('t9', { vp: 9 }, '=>[0:1:1:2]')])
    tp.vm.$emit('restore-view', 't9')
    await flushPromises()
    expect(hh.setViewpoint).toHaveBeenCalledWith({ vp: 9 }) // view still restored
    expect(hh.highlightObjects).not.toHaveBeenCalled() // nothing selected — the id is gone
    expect(w.find('.mv-anchor-note').exists()).toBe(true) // the drift notice shows
    // Dismissible.
    await w.find('.mv-anchor-x').trigger('click')
    expect(w.find('.mv-anchor-note').exists()).toBe(false)
  })

  it('a marker activation focuses the thread in the panel', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    w.findComponent({ name: 'Model3DViewer' }).vm.$emit('annotation-activate', 't3')
    await flushPromises()
    expect(hh.scrollToThread).toHaveBeenCalledWith('t3')
  })

  it('right-click object → context menu → comment on object opens the composer', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    w.findComponent({ name: 'Model3DViewer' }).vm.$emit('object-context', {
      clientX: 100, clientY: 120, objectId: 'obj-3', worldPos: { x: 1, y: 2, z: 3 },
    })
    await flushPromises()
    const menu = w.find('.mv-ctxmenu')
    expect(menu.exists()).toBe(true)
    await menu.find('.mv-ctxitem').trigger('click')
    // Anchored to the picked object + its world point, then handed to the composer.
    expect(hh.captureViewpointAnchor).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 }, 'obj-3')
    expect(hh.startAnnotation).toHaveBeenCalled()
    expect(w.find('.mv-ctxmenu').exists()).toBe(false) // menu closed after acting
  })

  it('a null object-context (empty space) shows no menu', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    w.findComponent({ name: 'Model3DViewer' }).vm.$emit('object-context', null)
    await flushPromises()
    expect(w.find('.mv-ctxmenu').exists()).toBe(false)
  })

  const openCtxMenu = async (w: ReturnType<typeof mountOverlay>) => {
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    w.findComponent({ name: 'Model3DViewer' }).vm.$emit('object-context', {
      clientX: 10, clientY: 10, objectId: 'obj-3',
      worldPos: { x: 1, y: 2, z: 3 }, worldDir: { x: 0, y: 0, z: 1 },
    })
    await flushPromises()
  }

  it('toggles see-through mode and resets X-ray from the Objects tab', async () => {
    const w = mountOverlay()
    const store = useModel3dStore()
    store.open('file1', 'tower.ifc')
    await flushPromises()
    const seeThrough = w.findAll('.mv-act').find((b) => b.text().includes('See-through'))!
    expect(store.seeThroughMode).toBe(false)
    await seeThrough.trigger('click')
    await flushPromises()
    expect(store.seeThroughMode).toBe(true) // mode on
    expect(w.findAll('.mv-act').find((b) => b.text().includes('See-through'))!.classes()).toContain('mv-on')

    // Reset is disabled with nothing X-rayed, enabled once something is.
    const resetBtn = () => w.findAll('.mv-act').find((b) => b.text().includes('✕ Reset'))!
    expect((resetBtn().element as HTMLButtonElement).disabled).toBe(true)
    store.setXRayed(['a', 'b'])
    await flushPromises()
    await w.vm.$nextTick()
    expect((resetBtn().element as HTMLButtonElement).disabled).toBe(false)
    await resetBtn().trigger('click')
    expect(hh.clearXRay).toHaveBeenCalled()
  })

  it('the menu sets navigation mode from its Navigation options', async () => {
    const w = mountOverlay()
    await openCtxMenu(w)
    const plan = w.findAll('.mv-ctxitem').find((b) => b.text().includes('Plan'))!
    await plan.trigger('click')
    expect(hh.setNavMode).toHaveBeenCalledWith('planView')
    expect(w.find('.mv-ctxmenu').exists()).toBe(false) // closed after acting
  })

  it('"Slice here" drops a section plane at the picked surface', async () => {
    const w = mountOverlay()
    await openCtxMenu(w)
    const slice = w.findAll('.mv-ctxitem').find((b) => b.text().includes('Slice here'))!
    await slice.trigger('click')
    expect(hh.addSectionPlane).toHaveBeenCalledWith({ pos: [1, 2, 3], dir: [0, 0, 1] })
    expect(hh.editSectionPlane).toHaveBeenCalledWith('sp1') // show the drag control
  })

  it('"Slice here" is hidden when the pick has no surface normal', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    w.findComponent({ name: 'Model3DViewer' }).vm.$emit('object-context', {
      clientX: 10, clientY: 10, objectId: 'obj-3', worldPos: { x: 1, y: 2, z: 3 }, // no worldDir
    })
    await flushPromises()
    expect(w.findAll('.mv-ctxitem').some((b) => b.text().includes('Slice here'))).toBe(false)
  })
})


// A differenced model is just another 3D model: it lives under the same file and
// shares that file's comments. But a viewpoint captured on the comparison means
// nothing over the plain model — the elements it frames are not in that scene —
// so a comment records which of the two it belongs to and activating it switches.
describe('comments across a model and its comparison', () => {
  // Its own pinia and clean spies — without this the suite inherits both from the
  // describe above, and a call made by an earlier test reads as one made here.
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    hh.route.query = {}
  })

  const VIEWPOINT = { camera: 'x' }
  const PAIR = { base: '2026-08-16T09:00:00', target: '2026-08-17T10:00:00' }

  function thread(id: string, model_source?: Record<string, string>) {
    return { id, status: 'open', comments: [], anchor: { kind: 'model-viewpoint', viewpoint: VIEWPOINT, model_source } }
  }

  async function overlay(opts?: { comparison?: boolean }) {
    const store = useModel3dStore()
    hh.loadRenditionSet.mockResolvedValue({})
    hh.modelRendition.mockReturnValue({ uid: 'plain-xkt' })
    if (opts?.comparison) {
      store.open('f1', 'tower.ifc — comparison', { xktUid: 'diff-xkt', metamodelUid: 'diff-meta', diff: PAIR })
    } else {
      store.open('f1', 'tower.ifc')
    }
    const w = mountOverlay()
    await flushPromises()
    store.setReady(true)
    await flushPromises()
    return { w, store }
  }

  function panel(w: ReturnType<typeof mountOverlay>) {
    return w.findComponent({ name: 'ThreadPanel' })
  }

  it('files a comparison thread against the FILE, sharing its conversation', async () => {
    const { w } = await overlay({ comparison: true })
    // Not the diff rendition's uid: a comment filed there would be buried on a
    // hidden child instead of joining the document's own discussion.
    expect(panel(w).props('fileUid')).toBe('f1')
  })

  it('records which model a viewpoint was captured on', async () => {
    const { w } = await overlay({ comparison: true })
    await w.get('.tp-stub')  // panel is mounted
    ;(w.vm as unknown as { commentHere: () => void }).commentHere()
    expect(hh.startAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ model_source: { kind: 'diff', ...PAIR } }))
  })

  it('keeps everything the viewpoint captured', async () => {
    // A comment on the comparison has to restore the whole view: camera,
    // selection, x-ray, section planes, measurements. All of that lives in the
    // BCF viewpoint the viewer captures — recording WHICH model it came from
    // must add to that, never replace any of it.
    const full = {
      kind: 'model-viewpoint',
      schema: 'fileengine.anchor.v1',
      viewpoint: { camera: 'c', selection: ['a'], xray: ['b'], clipping_planes: [{ x: 1 }] },
      object_refs: [{ id: 'e1' }],
      measurements: [{ type: 'distance', points: [] }],
    }
    hh.captureViewpointAnchor.mockReturnValueOnce(full as never)
    const { w } = await overlay({ comparison: true })
    ;(w.vm as unknown as { commentHere: () => void }).commentHere()
    expect(hh.startAnnotation).toHaveBeenCalledWith({
      ...full,
      model_source: { kind: 'diff', ...PAIR },
    })
  })

  it('marks a plain-model viewpoint as such', async () => {
    const { w } = await overlay()
    ;(w.vm as unknown as { commentHere: () => void }).commentHere()
    expect(hh.startAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ model_source: { kind: 'model' } }))
  })

  it('restores in place when the right model is already up', async () => {
    const { w } = await overlay({ comparison: true })
    panel(w).vm.$emit('threads', [thread('t1', { kind: 'diff', ...PAIR })])
    panel(w).vm.$emit('restore-view', 't1')
    await flushPromises()
    expect(hh.setViewpoint).toHaveBeenCalledWith(VIEWPOINT)
    expect(hh.getWhenReady).not.toHaveBeenCalled()   // nothing to switch to
  })

  it('switches to the comparison when activating a comment made on it', async () => {
    const { w, store } = await overlay()   // showing the plain model
    hh.getWhenReady.mockResolvedValue({
      status: 'ready', baseVersion: PAIR.base, targetVersion: PAIR.target,
      children: [
        { index: 0, name: 'm.xkt', uid: 'diff-xkt', mode: 'xkt', kind: 'model' },
        { index: 1, name: 'm.json', uid: 'diff-meta', mode: 'xkt', kind: 'metamodel' },
      ],
    })

    panel(w).vm.$emit('threads', [thread('t1', { kind: 'diff', ...PAIR })])
    panel(w).vm.$emit('restore-view', 't1')
    await flushPromises()

    expect(hh.getWhenReady).toHaveBeenCalledWith('f1', { version: PAIR.target, base: PAIR.base })
    expect(store.xktUid).toBe('diff-xkt')
    expect(store.diff).toEqual(PAIR)
    // The viewpoint waits for the new scene: applying it to the old one would
    // frame elements that are not there.
    expect(hh.setViewpoint).not.toHaveBeenCalled()

    store.setReady(true)
    await flushPromises()
    expect(hh.setViewpoint).toHaveBeenCalledWith(VIEWPOINT)
  })

  it('switches back to the file own model for a plain comment', async () => {
    const { w, store } = await overlay({ comparison: true })
    panel(w).vm.$emit('threads', [thread('t1', { kind: 'model' })])
    panel(w).vm.$emit('restore-view', 't1')
    await flushPromises()

    expect(store.diff).toBeNull()
    expect(store.xktUid).toBe('')   // cleared, so the overlay resolves the file own model
    expect(store.name).toBe('tower.ifc')
    store.setReady(true)
    await flushPromises()
    expect(hh.setViewpoint).toHaveBeenCalledWith(VIEWPOINT)
  })

  it('treats an anchor with no recorded source as the plain model', async () => {
    // Every anchor captured before comparisons existed has no model_source.
    const { w, store } = await overlay({ comparison: true })
    panel(w).vm.$emit('threads', [thread('t1')])
    panel(w).vm.$emit('restore-view', 't1')
    await flushPromises()
    expect(store.diff).toBeNull()
  })

  it('says so when the comparison cannot be reopened', async () => {
    const { w } = await overlay()
    hh.getWhenReady.mockResolvedValue({ status: 'none', children: [] })
    panel(w).vm.$emit('threads', [thread('t1', { kind: 'diff', ...PAIR })])
    panel(w).vm.$emit('restore-view', 't1')
    await flushPromises()
    expect(w.text()).toContain('could not be reopened')
  })
})

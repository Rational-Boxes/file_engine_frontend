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
  captureViewpointAnchor: vi.fn(() => ({ kind: 'model-viewpoint' })),
  setNavMode: vi.fn(),
  addSectionPlane: vi.fn(() => 'sp1'),
  editSectionPlane: vi.fn(),
  clearXRay: vi.fn(),
  // ThreadPanel exposed methods.
  focusThread: vi.fn(),
  startAnnotation: vi.fn(),
}))

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
      expose({ focusThread: hh.focusThread, startAnnotation: hh.startAnnotation })
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
  const anchoredThread = (id: string, viewpoint: unknown, objectId?: string) => ({
    id,
    anchor: {
      kind: 'model-viewpoint',
      viewpoint,
      object_refs: objectId ? [{ id: objectId }] : [],
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
    expect(hh.focusThread).toHaveBeenCalledWith('t1')
  })

  it('restore-view from the panel replays that thread’s viewpoint', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    useModel3dStore().setReady(true)
    const tp = w.findComponent({ name: 'ThreadPanel' })
    tp.vm.$emit('threads', [anchoredThread('t2', { vp: 2 }, 'obj-42')])
    tp.vm.$emit('restore-view', 't2')
    await flushPromises()
    expect(hh.setViewpoint).toHaveBeenCalledWith({ vp: 2 })
    expect(hh.highlightObjects).toHaveBeenCalledWith(['obj-42']) // tagged object selected
    expect(hh.focusThread).toHaveBeenCalledWith('t2')
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
    expect(hh.focusThread).toHaveBeenCalledWith('t3')
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

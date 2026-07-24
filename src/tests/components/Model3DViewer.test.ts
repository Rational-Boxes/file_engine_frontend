import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const XKT = new Uint8Array([1, 2, 3]).buffer

const h = vi.hoisted(() => {
  // A fake SectionPlanesPlugin that actually tracks planes so syncSectionPlanes
  // (which reads `.sectionPlanes`) mirrors a realistic id set into the store.
  const sectionPlanes = {
    sectionPlanes: {} as Record<string, any>,
    createSectionPlane: vi.fn(),
    clear: vi.fn(),
    showControl: vi.fn(),
    hideControl: vi.fn(),
  }
  sectionPlanes.createSectionPlane.mockImplementation((cfg: Record<string, unknown> = {}) => {
    const id = 'sp' + (Object.keys(sectionPlanes.sectionPlanes).length + 1)
    const plane = { id, ...cfg, active: true, flipDir: vi.fn() }
    sectionPlanes.sectionPlanes[id] = plane
    return plane
  })
  sectionPlanes.clear.mockImplementation(() => {
    sectionPlanes.sectionPlanes = {}
  })
  const VIEWPOINT = { perspective_camera: {}, clipping_planes: [] }
  // AnnotationsPlugin double: createAnnotation/clear + an `on` that captures the
  // markerClicked handler so a test can fire it.
  const annotations = { createAnnotation: vi.fn(), clear: vi.fn(), on: vi.fn() }
  const annHandlers: Record<string, (a: { id?: string }) => void> = {}
  annotations.on.mockImplementation((evt: string, cb: (a: { id?: string }) => void) => {
    annHandlers[evt] = cb
  })
  return {
    annotations,
    annHandlers,
    loadSpy: vi.fn(),
    destroySpy: vi.fn(),
    resizeSpy: vi.fn(),
    navCube: vi.fn(),
    renditionArrayBuffer: vi.fn(),
    renditionText: vi.fn(),
    // The CameraControl whose dolly rates + navMode the API/slider tweak.
    cameraControl: {} as Record<string, unknown>,
    // The Camera whose pan() the viewer wraps to scale panning; fresh per test.
    panSpy: vi.fn(),
    camera: null as any,
    // Plugin-host doubles.
    setHighlighted: vi.fn(),
    getSnapshot: vi.fn(() => 'data:image/png;base64,AAAA'),
    // Navigation doubles (§6): camera flight + scene AABB/selection.
    flyTo: vi.fn(),
    getAABB: vi.fn(() => [0, 0, 0, 2, 2, 2]),
    highlightedIds: [] as string[],
    aabb: [0, 0, 0, 10, 10, 10], // centre (5,5,5), diagonal ~17.3
    // Right-click picking: scene.pick returns the configured hit.
    scenePick: vi.fn(),
    pickHit: null as unknown,
    // See-through (X-ray): setObjectsXRayed spy + scene.objects + metaScene subtree.
    setXRayed: vi.fn(),
    sceneObjects: {} as Record<string, unknown>,
    metaScene: { metaObjects: {} as Record<string, unknown> },
    sectionPlanes,
    distance: { control: { activate: vi.fn(), deactivate: vi.fn(), snapping: false }, clear: vi.fn() },
    angle: { control: { activate: vi.fn(), deactivate: vi.fn(), snapping: false }, clear: vi.fn() },
    metrics: { units: 'meters' },
    bcf: { getViewpoint: vi.fn(() => VIEWPOINT), setViewpoint: vi.fn() },
    VIEWPOINT,
  }
})

vi.mock('@/services/renditions', () => ({
  renditionArrayBuffer: h.renditionArrayBuffer,
  renditionText: h.renditionText,
}))
vi.mock('@/services/fileService', () => ({ fileService: { downloadFile: vi.fn() } }))

vi.mock('@xeokit/xeokit-sdk', () => ({
  Viewer: vi.fn().mockImplementation(() => ({
    scene: {
      canvas: { resize: h.resizeSpy },
      setObjectsHighlighted: h.setHighlighted,
      get highlightedObjectIds() {
        return h.highlightedIds
      },
      aabb: h.aabb,
      getAABB: h.getAABB,
      metrics: h.metrics,
      pick: h.scenePick,
      setObjectsXRayed: h.setXRayed,
      objects: h.sceneObjects,
    },
    metaScene: h.metaScene,
    cameraFlight: { flyTo: h.flyTo },
    cameraControl: h.cameraControl,
    camera: h.camera,
    getSnapshot: h.getSnapshot,
    destroy: h.destroySpy,
  })),
  XKTLoaderPlugin: vi.fn().mockImplementation(() => ({ load: h.loadSpy })),
  NavCubePlugin: h.navCube.mockImplementation(() => ({})),
  TreeViewPlugin: vi.fn().mockImplementation(() => ({ destroy: vi.fn() })),
  SectionPlanesPlugin: vi.fn().mockImplementation(() => h.sectionPlanes),
  DistanceMeasurementsPlugin: vi.fn().mockImplementation(() => h.distance),
  AngleMeasurementsPlugin: vi.fn().mockImplementation(() => h.angle),
  AnnotationsPlugin: vi.fn().mockImplementation(() => h.annotations),
  BCFViewpointsPlugin: vi.fn().mockImplementation(() => h.bcf),
}))

import Model3DViewer from '@/components/Model3DViewer.vue'
import {
  Viewer,
  XKTLoaderPlugin,
  SectionPlanesPlugin,
  DistanceMeasurementsPlugin,
  AngleMeasurementsPlugin,
  AnnotationsPlugin,
  BCFViewpointsPlugin,
} from '@xeokit/xeokit-sdk'
import { useModel3dStore } from '@/stores/model3d'

let pinia: ReturnType<typeof createPinia>

// Mount with pinia installed; the component's plugin host mirrors state into the
// model3d store.
function mountViewer(props: {
  xktUid: string
  metamodelUid?: string
  treeContainerId?: string
  navStep?: number
}) {
  return mount(Model3DViewer, { props, global: { plugins: [pinia] } })
}

// The exposed imperative API (defineExpose).
type ViewerApi = {
  resize: () => void
  resetCamera: () => void
  getViewpoint: () => unknown
  setViewpoint: (v: unknown) => void
  captureViewpointAnchor: (marker?: { x: number; y: number; z: number }, objectId?: string) => unknown
  renderAnnotations: (
    items: Array<{ id: string; threadId: string; marker?: { x: number; y: number; z: number }; viewpoint: unknown }>,
  ) => void
  captureSnapshot: () => string | null
  addSectionPlane: (cfg?: unknown) => string | null
  addAxisSection: (axis: 'x' | 'y' | 'z') => string | null
  addSectionBox: () => string[]
  flipSectionPlane: (id: string) => void
  setSectionPlaneActive: (id: string, active: boolean) => void
  editSectionPlane: (id: string) => void
  clearSectionPlanes: () => void
  startMeasurement: (k: 'none' | 'distance' | 'angle') => void
  clearMeasurements: () => void
  setMeasurementUnits: (u: 'mm' | 'm' | 'ft') => void
  setNavMode: (m: 'orbit' | 'firstPerson' | 'planView') => void
  standardView: (k: 'top' | 'front' | 'iso' | 'fit') => void
  fitToSelection: () => void
  highlightObjects: (ids: string[]) => void
  xraySubtree: (objectId: string, xrayed: boolean) => void
  clearXRay: () => void
}

describe('Model3DViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)
    h.cameraControl = {}
    h.camera = { pan: h.panSpy }
    h.sectionPlanes.sectionPlanes = {}
    h.highlightedIds = []
    h.distance.control.snapping = false
    h.angle.control.snapping = false
    h.metrics.units = 'meters'
    h.pickHit = null
    h.scenePick.mockImplementation(() => h.pickHit)
    h.sceneObjects = {}
    h.metaScene.metaObjects = {}
    h.renditionArrayBuffer.mockResolvedValue(XKT)
  })

  it('lazily loads xeokit, creates a viewer, and loads the fetched XKT buffer', async () => {
    mountViewer({ xktUid: 'r1' })
    await flushPromises()

    expect(h.renditionArrayBuffer).toHaveBeenCalledWith('r1')
    expect(Viewer).toHaveBeenCalledTimes(1)
    // Nav cube is disabled (xeokit-sdk #2016 shader crash); not instantiated.
    expect(h.navCube).not.toHaveBeenCalled()
    expect(XKTLoaderPlugin).toHaveBeenCalledTimes(1)
    expect(h.loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'model', xkt: XKT }))
  })

  it('loads the MetaModel sidecar as metaModelData when a metamodelUid is given (§5.2)', async () => {
    h.renditionText.mockResolvedValue(JSON.stringify({ metaObjects: [{ id: 'g1', type: 'IfcWall' }] }))
    mountViewer({ xktUid: 'r1', metamodelUid: 'mm1' })
    await flushPromises()
    expect(h.renditionText).toHaveBeenCalledWith('mm1')
    expect(h.loadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'model',
        xkt: XKT,
        metaModelData: expect.objectContaining({ metaObjects: expect.any(Array) }),
      }),
    )
  })

  it('loads geometry only when there is no metamodel (unchanged path)', async () => {
    mountViewer({ xktUid: 'r1' })
    await flushPromises()
    expect(h.renditionText).not.toHaveBeenCalled()
    expect(h.loadSpy).toHaveBeenCalledWith(expect.not.objectContaining({ metaModelData: expect.anything() }))
  })

  it('constructs the markup / BCF plugin suite on load (the plugin host)', async () => {
    mountViewer({ xktUid: 'r1' })
    await flushPromises()
    expect(SectionPlanesPlugin).toHaveBeenCalledTimes(1)
    expect(DistanceMeasurementsPlugin).toHaveBeenCalledTimes(1)
    expect(AngleMeasurementsPlugin).toHaveBeenCalledTimes(1)
    expect(AnnotationsPlugin).toHaveBeenCalledTimes(1)
    expect(BCFViewpointsPlugin).toHaveBeenCalledTimes(1)
    // Load publishes the default live state to the store.
    const store = useModel3dStore()
    expect(store.ready).toBe(true)
    expect(store.navMode).toBe('orbit')
  })

  it('getViewpoint()/setViewpoint() delegate to BCFViewpointsPlugin', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const vm = w.vm as unknown as ViewerApi
    expect(vm.getViewpoint()).toBe(h.VIEWPOINT)
    expect(h.bcf.getViewpoint).toHaveBeenCalled()
    vm.setViewpoint(h.VIEWPOINT)
    expect(h.bcf.setViewpoint).toHaveBeenCalledWith(h.VIEWPOINT, undefined)
  })

  it('captureViewpointAnchor() builds a model-viewpoint anchor from the current view', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const anchor = (w.vm as unknown as ViewerApi).captureViewpointAnchor({ x: 1, y: 2, z: 3 }) as Record<
      string,
      unknown
    >
    expect(anchor).toMatchObject({
      kind: 'model-viewpoint',
      schema: 'fileengine.anchor.v1',
      viewpoint: h.VIEWPOINT,
      marker: { x: 1, y: 2, z: 3 },
      object_refs: [],
    })
  })

  it('renderAnnotations() creates a marker per anchored thread (skipping camera-only)', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).renderAnnotations([
      { id: 't1', threadId: 't1', marker: { x: 1, y: 2, z: 3 }, viewpoint: h.VIEWPOINT },
      { id: 't2', threadId: 't2', viewpoint: h.VIEWPOINT }, // no marker → no in-scene badge
    ])
    expect(h.annotations.clear).toHaveBeenCalled() // rebuilt from scratch
    expect(h.annotations.createAnnotation).toHaveBeenCalledTimes(1)
    expect(h.annotations.createAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ann-t1', worldPos: [1, 2, 3] }),
    )
  })

  it('clicking a marker restores its viewpoint and emits annotation-activate', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).renderAnnotations([
      { id: 't1', threadId: 't1', marker: { x: 0, y: 0, z: 0 }, viewpoint: h.VIEWPOINT },
    ])
    // Fire the AnnotationsPlugin markerClicked event captured by the mock.
    h.annHandlers.markerClicked({ id: 'ann-t1' })
    expect(h.bcf.setViewpoint).toHaveBeenCalledWith(h.VIEWPOINT, undefined)
    expect(w.emitted('annotation-activate')?.[0]).toEqual(['t1'])
  })

  it('Ctrl+left-click picks an object, highlights it, and emits object-context', async () => {
    h.pickHit = { entity: { id: 'obj-7' }, worldPos: [1, 2, 3], worldNormal: [0, 0, 1] }
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    await w.find('canvas.m3d-canvas').trigger('click', { ctrlKey: true, button: 0, clientX: 40, clientY: 50 })
    expect(w.emitted('object-context')?.[0]?.[0]).toMatchObject({
      objectId: 'obj-7',
      worldPos: { x: 1, y: 2, z: 3 },
      worldDir: { x: 0, y: 0, z: 1 }, // surface normal for "Slice here"
      clientX: 40,
      clientY: 50,
    })
    expect(h.setHighlighted).toHaveBeenCalledWith(['obj-7'], true)
  })

  it('⌘+left-click works too (macOS)', async () => {
    h.pickHit = { entity: { id: 'obj-8' }, worldPos: [0, 0, 0] }
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    await w.find('canvas.m3d-canvas').trigger('click', { metaKey: true, button: 0 })
    expect(w.emitted('object-context')?.[0]?.[0]).toMatchObject({ objectId: 'obj-8' })
  })

  it('Ctrl+left-click on empty space emits a null object-context (dismiss)', async () => {
    h.pickHit = null
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    await w.find('canvas.m3d-canvas').trigger('click', { ctrlKey: true, button: 0 })
    expect(w.emitted('object-context')?.[0]?.[0]).toBeNull()
  })

  it('a plain left-click does NOT open the menu (kept free for navigation)', async () => {
    h.pickHit = { entity: { id: 'obj-2' }, worldPos: [0, 0, 0] }
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    await w.find('canvas.m3d-canvas').trigger('click', { button: 0, clientX: 5, clientY: 6 })
    expect(w.emitted('object-context')).toBeUndefined()
  })

  it('a right-click does NOT open the menu (kept free for pan)', async () => {
    h.pickHit = { entity: { id: 'obj-2' }, worldPos: [0, 0, 0] }
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    await w.find('canvas.m3d-canvas').trigger('contextmenu')
    expect(w.emitted('object-context')).toBeUndefined()
  })

  it('captureViewpointAnchor(marker, objectId) records the object ref', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const anchor = (w.vm as unknown as ViewerApi).captureViewpointAnchor(
      { x: 0, y: 0, z: 0 },
      'obj-9',
    ) as Record<string, unknown>
    expect(anchor.object_refs).toEqual([{ id: 'obj-9' }])
  })

  it('captureSnapshot() returns the viewer PNG snapshot', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const vm = w.vm as unknown as ViewerApi
    expect(vm.captureSnapshot()).toBe('data:image/png;base64,AAAA')
    expect(h.getSnapshot).toHaveBeenCalledWith(expect.objectContaining({ format: 'png' }))
  })

  it('setNavMode() sets CameraControl.navMode and mirrors it to the store', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).setNavMode('planView')
    expect(h.cameraControl.navMode).toBe('planView')
    expect(useModel3dStore().navMode).toBe('planView')
  })

  it('addSectionPlane() creates a plane and mirrors the id set into the store', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const vm = w.vm as unknown as ViewerApi
    const id = vm.addSectionPlane({ pos: [0, 0, 0], dir: [1, 0, 0] })
    expect(h.sectionPlanes.createSectionPlane).toHaveBeenCalled()
    expect(id).toBeTruthy()
    const store = useModel3dStore()
    expect(store.sectionPlaneIds).toHaveLength(1)
    expect(store.hasSection).toBe(true)
    vm.clearSectionPlanes()
    expect(h.sectionPlanes.clear).toHaveBeenCalled()
    expect(store.sectionPlaneIds).toHaveLength(0)
  })

  it('addAxisSection("x") cuts through the model centre and shows the drag control', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const id = (w.vm as unknown as ViewerApi).addAxisSection('x')
    expect(h.sectionPlanes.createSectionPlane).toHaveBeenCalledWith({ pos: [5, 5, 5], dir: [1, 0, 0] })
    expect(id).toBeTruthy()
    expect(useModel3dStore().sectionPlaneIds).toHaveLength(1)
    expect(h.sectionPlanes.showControl).toHaveBeenCalledWith(id) // immediately editable
  })

  it('addSectionBox() creates six bounding-box planes', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const ids = (w.vm as unknown as ViewerApi).addSectionBox()
    expect(h.sectionPlanes.createSectionPlane).toHaveBeenCalledTimes(6)
    expect(ids).toHaveLength(6)
    expect(useModel3dStore().sectionPlaneIds).toHaveLength(6)
  })

  it('flip / visibility / edit act on the named plane', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const vm = w.vm as unknown as ViewerApi
    const id = vm.addSectionPlane({ pos: [0, 0, 0], dir: [1, 0, 0] }) as string
    const plane = h.sectionPlanes.sectionPlanes[id]
    vm.flipSectionPlane(id)
    expect(plane.flipDir).toHaveBeenCalled()
    vm.setSectionPlaneActive(id, false)
    expect(plane.active).toBe(false)
    vm.editSectionPlane(id)
    expect(h.sectionPlanes.showControl).toHaveBeenCalledWith(id)
  })

  it('clearSectionPlanes hides the control and empties the store set', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const vm = w.vm as unknown as ViewerApi
    vm.addAxisSection('x')
    vm.clearSectionPlanes()
    expect(h.sectionPlanes.hideControl).toHaveBeenCalled()
    expect(h.sectionPlanes.clear).toHaveBeenCalled()
    expect(useModel3dStore().sectionPlaneIds).toHaveLength(0)
  })

  it('startMeasurement() activates one control (with snapping) and records the tool', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).startMeasurement('distance')
    expect(h.distance.control.activate).toHaveBeenCalled()
    expect(h.distance.control.snapping).toBe(true) // snap to vertices/edges (§8)
    expect(h.angle.control.deactivate).toHaveBeenCalled() // only one tool at a time
    expect(useModel3dStore().activeTool).toBe('distance')
  })

  it('clearMeasurements() clears both measurement plugins', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).clearMeasurements()
    expect(h.distance.clear).toHaveBeenCalled()
    expect(h.angle.clear).toHaveBeenCalled()
  })

  it('setMeasurementUnits() maps to xeokit metrics units and records the choice', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).setMeasurementUnits('mm')
    expect(h.metrics.units).toBe('millimeters')
    expect(useModel3dStore().measureUnits).toBe('mm')
  })

  it('xraySubtree() X-rays an object + its metamodel subtree and tracks it', async () => {
    h.metaScene.metaObjects = {
      storey: { id: 'storey', children: [{ id: 'wall', children: [] }, { id: 'door', children: [] }] },
    }
    h.sceneObjects = { storey: {}, wall: {}, door: {} } // only geometry objects
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).xraySubtree('storey', true)
    const [ids, on] = h.setXRayed.mock.calls[0]
    expect([...ids].sort()).toEqual(['door', 'storey', 'wall'])
    expect(on).toBe(true)
    expect([...useModel3dStore().xrayedIds].sort()).toEqual(['door', 'storey', 'wall'])
  })

  it('xraySubtree() falls back to the single object when there is no metamodel node', async () => {
    h.metaScene.metaObjects = {}
    h.sceneObjects = { x: {} }
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).xraySubtree('x', true)
    expect(h.setXRayed).toHaveBeenCalledWith(['x'], true)
  })

  it('clearXRay() restores every X-rayed object to solid', async () => {
    h.metaScene.metaObjects = { a: { id: 'a', children: [] } }
    h.sceneObjects = { a: {} }
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    const vm = w.vm as unknown as ViewerApi
    vm.xraySubtree('a', true)
    expect(useModel3dStore().xrayedIds).toEqual(['a'])
    vm.clearXRay()
    expect(h.setXRayed).toHaveBeenLastCalledWith(['a'], false)
    expect(useModel3dStore().xrayedIds).toEqual([])
  })

  it('highlightObjects() highlights the set and records the selection', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).highlightObjects(['a', 'b'])
    expect(h.setHighlighted).toHaveBeenCalledWith(['a', 'b'], true)
    expect(useModel3dStore().selection).toEqual(['a', 'b'])
  })

  it('applies followPointer + smartPivot on load (Workstream A feel)', async () => {
    mountViewer({ xktUid: 'r1' })
    await flushPromises()
    expect(h.cameraControl.followPointer).toBe(true)
    expect(h.cameraControl.smartPivot).toBe(true)
  })

  it("standardView('top') flies to a top-down eye/look/up", async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    h.flyTo.mockClear() // ignore the load-time resetCamera framing
    ;(w.vm as unknown as ViewerApi).standardView('top')
    expect(h.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ look: [5, 5, 5], up: [0, 0, -1] }),
    )
  })

  it("standardView('fit') refits the whole model", async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    h.flyTo.mockClear()
    ;(w.vm as unknown as ViewerApi).standardView('fit')
    expect(h.flyTo).toHaveBeenCalledTimes(1) // resetCamera → flyTo(scene)
  })

  it('fitToSelection() flies to the AABB of the highlighted objects', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    h.highlightedIds = ['a', 'b']
    h.flyTo.mockClear()
    ;(w.vm as unknown as ViewerApi).fitToSelection()
    expect(h.getAABB).toHaveBeenCalledWith(['a', 'b'])
    expect(h.flyTo).toHaveBeenCalledWith(expect.objectContaining({ aabb: [0, 0, 0, 2, 2, 2] }))
  })

  it('fitToSelection() with no selection refits the whole model', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    h.highlightedIds = []
    h.flyTo.mockClear()
    ;(w.vm as unknown as ViewerApi).fitToSelection()
    expect(h.getAABB).not.toHaveBeenCalled()
    expect(h.flyTo).toHaveBeenCalledTimes(1) // fell back to resetCamera
  })

  it('destroys the viewer on unmount and clears the live store state', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    expect(useModel3dStore().ready).toBe(true)
    w.unmount()
    expect(h.destroySpy).toHaveBeenCalled()
    expect(useModel3dStore().ready).toBe(false) // resetViewerState ran
  })

  it('exposes resize() which resizes the xeokit canvas', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).resize()
    expect(h.resizeSpy).toHaveBeenCalled()
  })

  it('scales the zoom (dolly) rates by the navStep prop (finer steps for CAD)', async () => {
    mountViewer({ xktUid: 'r1', navStep: 30 })
    await flushPromises()
    // navStep 30 → scale 0.3 applied to every xeokit default dolly rate.
    expect(h.cameraControl.mouseWheelDollyRate).toBe(30) // 100 * 0.3
    expect(h.cameraControl.keyboardDollyRate).toBe(3) //    10 * 0.3
    expect(h.cameraControl.touchDollyRate).toBeCloseTo(0.06) // 0.2 * 0.3
  })

  it('scales panning by wrapping camera.pan (governs mouse pan, which has no rate)', async () => {
    mountViewer({ xktUid: 'r1', navStep: 50 })
    await flushPromises()
    // Every pan mode funnels through camera.pan; the wrapper scales the vector by 0.5.
    h.camera.pan([10, 2, -4])
    expect(h.panSpy).toHaveBeenCalledWith([5, 1, -2])
  })

  it('live-updates zoom and pan scale when navStep changes (no reload)', async () => {
    const w = mountViewer({ xktUid: 'r1', navStep: 100 })
    await flushPromises()
    expect(h.cameraControl.mouseWheelDollyRate).toBe(100)
    h.camera.pan([10, 4, -6])
    expect(h.panSpy).toHaveBeenLastCalledWith([10, 4, -6]) // scale 1 at the default

    await w.setProps({ navStep: 50 })
    expect(h.cameraControl.mouseWheelDollyRate).toBe(50) // zoom rescaled…
    h.camera.pan([10, 4, -6])
    expect(h.panSpy).toHaveBeenLastCalledWith([5, 2, -3]) // …and pan read live too
    expect(Viewer).toHaveBeenCalledTimes(1) // slider tweak must not rebuild the viewer
  })

  it('shows an error (and does not throw) when loading fails', async () => {
    h.renditionArrayBuffer.mockRejectedValueOnce(new Error('boom'))
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    expect(w.find('.m3d-err').exists()).toBe(true)
  })
})

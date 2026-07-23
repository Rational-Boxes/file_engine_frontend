import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const XKT = new Uint8Array([1, 2, 3]).buffer

const h = vi.hoisted(() => {
  // A fake SectionPlanesPlugin that actually tracks planes so syncSectionPlanes
  // (which reads `.sectionPlanes`) mirrors a realistic id set into the store.
  const sectionPlanes = {
    sectionPlanes: {} as Record<string, unknown>,
    createSectionPlane: vi.fn(),
    clear: vi.fn(),
  }
  sectionPlanes.createSectionPlane.mockImplementation((cfg: Record<string, unknown> = {}) => {
    const id = 'sp' + (Object.keys(sectionPlanes.sectionPlanes).length + 1)
    sectionPlanes.sectionPlanes[id] = { id, ...cfg }
    return { id }
  })
  sectionPlanes.clear.mockImplementation(() => {
    sectionPlanes.sectionPlanes = {}
  })
  const VIEWPOINT = { perspective_camera: {}, clipping_planes: [] }
  return {
    loadSpy: vi.fn(),
    destroySpy: vi.fn(),
    resizeSpy: vi.fn(),
    navCube: vi.fn(),
    renditionArrayBuffer: vi.fn(),
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
    sectionPlanes,
    distance: { control: { activate: vi.fn(), deactivate: vi.fn() } },
    angle: { control: { activate: vi.fn(), deactivate: vi.fn() } },
    bcf: { getViewpoint: vi.fn(() => VIEWPOINT), setViewpoint: vi.fn() },
    VIEWPOINT,
  }
})

vi.mock('@/services/renditions', () => ({ renditionArrayBuffer: h.renditionArrayBuffer }))
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
    },
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
  AnnotationsPlugin: vi.fn().mockImplementation(() => ({})),
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
function mountViewer(props: { xktUid: string; treeContainerId?: string; navStep?: number }) {
  return mount(Model3DViewer, { props, global: { plugins: [pinia] } })
}

// The exposed imperative API (defineExpose).
type ViewerApi = {
  resize: () => void
  resetCamera: () => void
  getViewpoint: () => unknown
  setViewpoint: (v: unknown) => void
  captureSnapshot: () => string | null
  addSectionPlane: (cfg?: unknown) => string | null
  clearSectionPlanes: () => void
  startMeasurement: (k: 'none' | 'distance' | 'angle') => void
  setNavMode: (m: 'orbit' | 'firstPerson' | 'planView') => void
  standardView: (k: 'top' | 'front' | 'iso' | 'fit') => void
  fitToSelection: () => void
  highlightObjects: (ids: string[]) => void
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

  it('startMeasurement() activates one control and records the active tool', async () => {
    const w = mountViewer({ xktUid: 'r1' })
    await flushPromises()
    ;(w.vm as unknown as ViewerApi).startMeasurement('distance')
    expect(h.distance.control.activate).toHaveBeenCalled()
    expect(h.angle.control.deactivate).toHaveBeenCalled() // only one tool at a time
    expect(useModel3dStore().activeTool).toBe('distance')
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

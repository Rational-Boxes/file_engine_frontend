import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const XKT = new Uint8Array([1, 2, 3]).buffer

const h = vi.hoisted(() => ({
  loadSpy: vi.fn(),
  destroySpy: vi.fn(),
  resizeSpy: vi.fn(),
  navCube: vi.fn(),
  renditionArrayBuffer: vi.fn(),
  // The CameraControl whose dolly rates the slider tweaks; fresh per test.
  cameraControl: {} as Record<string, number>,
  // The Camera whose pan() the viewer wraps to scale panning; fresh per test.
  panSpy: vi.fn(),
  camera: null as any,
}))

vi.mock('@/services/renditions', () => ({ renditionArrayBuffer: h.renditionArrayBuffer }))
vi.mock('@/services/fileService', () => ({ fileService: { downloadFile: vi.fn() } }))

vi.mock('@xeokit/xeokit-sdk', () => ({
  Viewer: vi.fn().mockImplementation(() => ({
    scene: { canvas: { resize: h.resizeSpy } },
    cameraFlight: { flyTo: vi.fn() },
    cameraControl: h.cameraControl,
    camera: h.camera,
    destroy: h.destroySpy,
  })),
  XKTLoaderPlugin: vi.fn().mockImplementation(() => ({ load: h.loadSpy })),
  NavCubePlugin: h.navCube.mockImplementation(() => ({})),
  TreeViewPlugin: vi.fn().mockImplementation(() => ({ destroy: vi.fn() })),
}))

import Model3DViewer from '@/components/Model3DViewer.vue'
import { Viewer, XKTLoaderPlugin } from '@xeokit/xeokit-sdk'

describe('Model3DViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.cameraControl = {}
    h.camera = { pan: h.panSpy }
    h.renditionArrayBuffer.mockResolvedValue(XKT)
  })

  it('lazily loads xeokit, creates a viewer, and loads the fetched XKT buffer', async () => {
    mount(Model3DViewer, { props: { xktUid: 'r1' } })
    await flushPromises()

    expect(h.renditionArrayBuffer).toHaveBeenCalledWith('r1')
    expect(Viewer).toHaveBeenCalledTimes(1)
    // Nav cube is disabled (xeokit-sdk #2016 shader crash); not instantiated.
    expect(h.navCube).not.toHaveBeenCalled()
    expect(XKTLoaderPlugin).toHaveBeenCalledTimes(1)
    expect(h.loadSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'model', xkt: XKT }))
  })

  it('destroys the viewer on unmount (no leaked WebGL context)', async () => {
    const w = mount(Model3DViewer, { props: { xktUid: 'r1' } })
    await flushPromises()
    w.unmount()
    expect(h.destroySpy).toHaveBeenCalled()
  })

  it('exposes resize() which resizes the xeokit canvas', async () => {
    const w = mount(Model3DViewer, { props: { xktUid: 'r1' } })
    await flushPromises()
    ;(w.vm as unknown as { resize: () => void }).resize()
    expect(h.resizeSpy).toHaveBeenCalled()
  })

  it('scales the zoom (dolly) rates by the navStep prop (finer steps for CAD)', async () => {
    mount(Model3DViewer, { props: { xktUid: 'r1', navStep: 30 } })
    await flushPromises()
    // navStep 30 → scale 0.3 applied to every xeokit default dolly rate.
    expect(h.cameraControl.mouseWheelDollyRate).toBe(30) // 100 * 0.3
    expect(h.cameraControl.keyboardDollyRate).toBe(3) //    10 * 0.3
    expect(h.cameraControl.touchDollyRate).toBeCloseTo(0.06) // 0.2 * 0.3
  })

  it('scales panning by wrapping camera.pan (governs mouse pan, which has no rate)', async () => {
    mount(Model3DViewer, { props: { xktUid: 'r1', navStep: 50 } })
    await flushPromises()
    // Every pan mode funnels through camera.pan; the wrapper scales the vector by 0.5.
    h.camera.pan([10, 2, -4])
    expect(h.panSpy).toHaveBeenCalledWith([5, 1, -2])
  })

  it('live-updates zoom and pan scale when navStep changes (no reload)', async () => {
    const w = mount(Model3DViewer, { props: { xktUid: 'r1', navStep: 100 } })
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
    const w = mount(Model3DViewer, { props: { xktUid: 'r1' } })
    await flushPromises()
    expect(w.find('.m3d-err').exists()).toBe(true)
  })
})

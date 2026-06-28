import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const XKT = new Uint8Array([1, 2, 3]).buffer

const h = vi.hoisted(() => ({
  loadSpy: vi.fn(),
  destroySpy: vi.fn(),
  resizeSpy: vi.fn(),
  navCube: vi.fn(),
  renditionArrayBuffer: vi.fn(),
}))

vi.mock('@/services/renditions', () => ({ renditionArrayBuffer: h.renditionArrayBuffer }))
vi.mock('@/services/fileService', () => ({ fileService: { downloadFile: vi.fn() } }))

vi.mock('@xeokit/xeokit-sdk', () => ({
  Viewer: vi.fn().mockImplementation(() => ({
    scene: { canvas: { resize: h.resizeSpy } },
    cameraFlight: { flyTo: vi.fn() },
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

  it('shows an error (and does not throw) when loading fails', async () => {
    h.renditionArrayBuffer.mockRejectedValueOnce(new Error('boom'))
    const w = mount(Model3DViewer, { props: { xktUid: 'r1' } })
    await flushPromises()
    expect(w.find('.m3d-err').exists()).toBe(true)
  })
})

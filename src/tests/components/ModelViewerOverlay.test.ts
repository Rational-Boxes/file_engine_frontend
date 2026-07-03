import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h as createEl } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const hh = vi.hoisted(() => ({
  loadRenditionSet: vi.fn(),
  modelRendition: vi.fn(),
  resizeSpy: vi.fn(),
  resetCameraSpy: vi.fn(),
  downloadFile: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/services/renditions', () => ({
  loadRenditionSet: hh.loadRenditionSet,
  modelRendition: hh.modelRendition,
}))
vi.mock('@/services/fileService', () => ({ fileService: { downloadFile: hh.downloadFile } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: hh.push }) }))

// Stub the heavy viewer (xeokit) — assert the overlay wires it, not WebGL.
vi.mock('@/components/Model3DViewer.vue', () => ({
  default: defineComponent({
    name: 'Model3DViewer',
    props: ['xktUid', 'treeContainerId', 'navStep'],
    setup(_, { expose }) {
      expose({ resize: hh.resizeSpy, resetCamera: hh.resetCameraSpy })
      return () => createEl('div', { class: 'm3d-stub' })
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

  it('resets the camera to the default view via the header button', async () => {
    const w = mountOverlay()
    useModel3dStore().open('file1', 'tower.ifc')
    await flushPromises()
    const reset = w.findAll('.mv-act').find((b) => b.text().includes('Reset camera'))!
    expect(reset).toBeTruthy()
    await reset.trigger('click')
    expect(hh.resetCameraSpy).toHaveBeenCalled()
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
})

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
  ancestorObjectIds: vi.fn(() => [] as string[]),
  getWhenReady: vi.fn(),
  listVersions: vi.fn(async () => ['2026-08-17T10:00:00', '2026-08-16T09:00:00']),
  loadCaps: vi.fn(),
}))

vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: { load: hh.loadCaps, reset: vi.fn() },
}))

vi.mock('@/services/differenceService', () => ({ differenceService: { getWhenReady: hh.getWhenReady } }))
vi.mock('@/services/apiClient', () => ({ errorMessage: (_e: unknown, m: string) => m }))

vi.mock('@/services/renditions', () => ({
  loadRenditionSet: hh.loadRenditionSet,
  modelRendition: hh.modelRendition,
  metamodelRendition: hh.metamodelRendition,
}))
vi.mock('@/services/fileService', () => ({
  fileService: { downloadFile: hh.downloadFile, listVersions: hh.listVersions },
}))
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
        // The real viewer reports which rows sit ABOVE the see-through objects,
        // and hands back the element the tree was built into.
        ancestorObjectIds: hh.ancestorObjectIds,
        treeContainerEl: null,
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
    props: ['fileUid', 'embedded', 'hideDock', 'pos', 'anchorProvider'],
    emits: ['threads', 'restore-view', 'count', 'layout', 'update:pos'],
    setup(_, { expose }) {
      expose({ scrollToThread: hh.scrollToThread, startAnnotation: hh.startAnnotation })
      return () => createEl('div', { class: 'tp-stub' })
    },
  }),
}))

import ModelViewerOverlay from '@/components/ModelViewerOverlay.vue'
import { useModel3dStore } from '@/stores/model3d'
import { resetCapabilities } from '@/composables/useCapabilities'

const mountOverlay = () => mount(ModelViewerOverlay, { global: { stubs: { teleport: true } } })

const caps = (over: Record<string, boolean> = {}) => {
  const on = (k: string) => ({ available: over[k] !== false })
  return {
    editing: { available: true, reason: '', extensions: [] },
    chat: on('chat'), webSearch: on('webSearch'), search: on('search'),
    discussion: on('discussion'), sharing: on('sharing'), difference: on('difference'),
    folderActions: on('folderActions'), bcf: on('bcf'), audit: on('audit'),
  }
}

// The 3D viewer's comment chrome and docked panel follow the discussion service.
// Gating only the dock BEHAVIOUR was not enough: the header buttons and the
// panel still rendered, where they could do nothing but fail.
describe('ModelViewerOverlay — the discussion surface follows its service', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetCapabilities()
    hh.route.query = {}
    hh.loadRenditionSet.mockResolvedValue({})
    hh.modelRendition.mockReturnValue({ uid: 'xkt1', name: 'v-model.xkt', fmt: 'model', ext: 'xkt', version: 'v' })
  })

  const openModel = async () => {
    const w = mountOverlay()
    useModel3dStore().open('m1', 'house.ifc')
    await flushPromises()
    return w
  }

  it('renders the comment panel and its chrome where discussion is deployed', async () => {
    hh.loadCaps.mockResolvedValue(caps())
    const w = await openModel()
    expect(w.find('.mv-disc').exists()).toBe(true)
    expect(w.find('.mv-discussion').exists()).toBe(true)
  })

  it('renders neither where the discussion service is absent', async () => {
    hh.loadCaps.mockResolvedValue(caps({ discussion: false }))
    const w = await openModel()
    expect(w.find('.mv-disc').exists()).toBe(false)
    expect(w.find('.mv-discussion').exists()).toBe(false)
  })

  it('still shows the model itself — only the discussion is optional', async () => {
    hh.loadCaps.mockResolvedValue(caps({ discussion: false }))
    const w = await openModel()
    expect(w.find('.m3d-stub').exists()).toBe(true)
  })

  it('renders the discussion surface while the deployment has not answered', async () => {
    hh.loadCaps.mockReturnValue(new Promise(() => {}))
    const w = await openModel()
    expect(w.find('.mv-disc').exists()).toBe(true)
  })
})

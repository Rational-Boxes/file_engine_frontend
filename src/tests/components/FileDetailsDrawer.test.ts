import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const fns = vi.hoisted(() => ({
  stat: vi.fn(),
  getMetadata: vi.fn(),
  checkPermission: vi.fn(),
  generatePreview: vi.fn(),
  loadRenditionSet: vi.fn(),
  modelRendition: vi.fn(),
}))

vi.mock('@/services/fileService', () => ({
  fileService: {
    stat: fns.stat,
    getMetadata: fns.getMetadata,
    checkPermission: fns.checkPermission,
    downloadItem: vi.fn(),
  },
}))
vi.mock('@/services/apiClient', () => ({
  default: {},
  errorMessage: (_e: unknown, d: string) => d,
  ROOT_UID: '00000000-0000-0000-0000-000000000000',
}))
vi.mock('@/services/searchService', () => ({ searchService: { generatePreview: fns.generatePreview } }))
vi.mock('@/services/renditions', () => ({
  loadRenditionSet: fns.loadRenditionSet,
  modelRendition: fns.modelRendition,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ resolve: () => ({ href: '/x' }) }) }))

vi.mock('@/components/AclEditor.vue', () => ({
  default: { name: 'AclEditor', props: ['uid', 'canManage'], template: '<div/>' },
}))
vi.mock('@/components/DocumentPreview.vue', () => ({
  default: { name: 'DocumentPreview', props: ['uid', 'name', 'hasRenditions'], template: '<div/>' },
}))
vi.mock('@/components/FileVersions.vue', () => ({
  default: { name: 'FileVersions', props: ['uid', 'name', 'current', 'canManage'], template: '<div/>' },
}))

import FileDetailsDrawer from '@/components/FileDetailsDrawer.vue'
import { useFileStore } from '@/stores/files'
import { useModel3dStore } from '@/stores/model3d'

function openWith(item: { uid: string; name: string; hasRenditions: boolean }) {
  const files = useFileStore()
  files.detailItem = { isDirectory: false, type: 'file', size: 1, renditionCount: 1, deleted: false, ...item }
  files.drawerOpen = true
  return mount(FileDetailsDrawer)
}

const viewBtn = (w: ReturnType<typeof openWith>) =>
  w.findAll('.view3d-btn').find((b) => b.text().includes('View model'))
const genBtn = (w: ReturnType<typeof openWith>) =>
  w.findAll('.view3d-btn').find((b) => b.text().includes('Generate'))

describe('FileDetailsDrawer — 3D model section', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    fns.stat.mockResolvedValue({ uid: 'f1', name: 'x', type: 'file', size: 1, owner: 'u', version: 'v1' })
    fns.getMetadata.mockResolvedValue({})
    fns.checkPermission.mockResolvedValue(true)
    fns.generatePreview.mockResolvedValue({ status: 'indexed', renditions: [], hasMarkdown: true })
    fns.loadRenditionSet.mockResolvedValue({})
    fns.modelRendition.mockReturnValue(undefined)
  })

  it('a converted 3D model shows the View link and opens the viewer', async () => {
    const w = openWith({ uid: 'm1', name: 'tower.ifc', hasRenditions: true })
    await flushPromises()
    expect(viewBtn(w)).toBeTruthy()
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(false)
    await viewBtn(w)!.trigger('click')
    expect(useModel3dStore().isOpen).toBe(true)
  })

  it('a non-3D file shows the document preview, no 3D buttons', async () => {
    const w = openWith({ uid: 'd1', name: 'report.pdf', hasRenditions: true })
    await flushPromises()
    expect(w.find('.view3d-btn').exists()).toBe(false)
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(true)
  })

  it('an unconverted 3D file offers Generate (not the document preview)', async () => {
    const w = openWith({ uid: 'm2', name: 'model.glb', hasRenditions: false })
    await flushPromises()
    expect(genBtn(w)).toBeTruthy()
    expect(viewBtn(w)).toBeFalsy()
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(false)
  })

  it('Generate that yields a model switches to the View link', async () => {
    const w = openWith({ uid: 'm3', name: 'model.glb', hasRenditions: false })
    await flushPromises()
    fns.modelRendition.mockReturnValue({ uid: 'rk', name: 'v1-model.xkt', fmt: 'model', ext: 'xkt', version: 'v1' })
    await genBtn(w)!.trigger('click')
    await flushPromises()
    expect(fns.generatePreview).toHaveBeenCalledWith('m3')
    expect(viewBtn(w)).toBeTruthy()
  })

  it('Generate that yields no model reports an unsupported-format message', async () => {
    const w = openWith({ uid: 'm4', name: 'old.ifc', hasRenditions: false })
    await flushPromises()
    fns.modelRendition.mockReturnValue(undefined) // converter produced no geometry
    await genBtn(w)!.trigger('click')
    await flushPromises()
    expect(w.find('.gen-msg.err').text()).toContain('not supported')
  })

  it('Generate reports when the conversion service is unreachable', async () => {
    const w = openWith({ uid: 'm5', name: 'model.glb', hasRenditions: false })
    await flushPromises()
    fns.generatePreview.mockRejectedValueOnce(new Error('500'))
    await genBtn(w)!.trigger('click')
    await flushPromises()
    expect(w.find('.gen-msg.err').text()).toContain('conversion service')
  })
})

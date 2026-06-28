import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const fns = vi.hoisted(() => ({
  stat: vi.fn(),
  getMetadata: vi.fn(),
  checkPermission: vi.fn(),
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
vi.mock('vue-router', () => ({ useRouter: () => ({ resolve: () => ({ href: '/x' }) }) }))

// Stub heavy children so the drawer mounts in isolation (plain options objects —
// vi.mock factories are hoisted, so they must not reference outer helpers/imports).
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
  files.detailItem = { isDirectory: false, type: 'file', size: 1, renditionCount: 1, ...item }
  files.drawerOpen = true
  return mount(FileDetailsDrawer)
}

describe('FileDetailsDrawer — View model in 3D link', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    fns.stat.mockResolvedValue({ uid: 'f1', name: 'x', type: 'file', size: 1, owner: 'u', version: 'v1' })
    fns.getMetadata.mockResolvedValue({})
    fns.checkPermission.mockResolvedValue(true)
  })

  it('shows the link for a 3D model with renditions and opens the viewer', async () => {
    const w = openWith({ uid: 'm1', name: 'tower.ifc', hasRenditions: true })
    await flushPromises()
    const btn = w.find('.view3d-btn')
    expect(btn.exists()).toBe(true)
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(false) // replaced by the link
    await btn.trigger('click')
    const m3d = useModel3dStore()
    expect(m3d.isOpen).toBe(true)
    expect(m3d.uid).toBe('m1')
  })

  it('does not show the link for a non-3D file (shows the document preview)', async () => {
    const w = openWith({ uid: 'd1', name: 'report.pdf', hasRenditions: true })
    await flushPromises()
    expect(w.find('.view3d-btn').exists()).toBe(false)
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(true)
  })

  it('does not show the link for a 3D file without a converted rendition', async () => {
    const w = openWith({ uid: 'm2', name: 'model.glb', hasRenditions: false })
    await flushPromises()
    expect(w.find('.view3d-btn').exists()).toBe(false)
  })
})

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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const fns = vi.hoisted(() => ({
  stat: vi.fn(),
  listDirectory: vi.fn(),
  getMetadata: vi.fn(),
  checkPermission: vi.fn(),
  generatePreview: vi.fn(),
  loadRenditionSet: vi.fn(),
  modelRendition: vi.fn(),
}))

vi.mock('@/services/fileService', () => ({
  fileService: {
    stat: fns.stat,
    listDirectory: fns.listDirectory,
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
const routeStub: { query: Record<string, string> } = { query: {} }

vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: () => ({ href: '/x' }) }),
  // The drawer reads ?tab= to honour a deep link into a specific pane.
  useRoute: () => routeStub,
}))

const { provenance } = vi.hoisted(() => ({ provenance: vi.fn() }))
vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  const svc = { provenance }
  return { ...actual, shareService: svc, default: svc }
})

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
import { useAuthStore } from '@/stores/auth'
import { useModel3dStore } from '@/stores/model3d'

function openWith(item: { uid: string; name: string; hasRenditions: boolean }) {
  const files = useFileStore()
  files.detailItem = { isDirectory: false, type: 'file', size: 1, renditionCount: 1, deleted: false, createdAt: 0, modifiedAt: 0, owner: '', createdBy: '', modifiedBy: '', ...item }
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

  it('closes on Escape', async () => {
    const files = useFileStore()
    openWith({ uid: 'f1', name: 'a.txt', hasRenditions: false })
    await flushPromises()
    expect(files.drawerOpen).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(files.drawerOpen).toBe(false)
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

  it('stays on the Access tab after an ACL edit (does not reset to Info)', async () => {
    const w = openWith({ uid: 'f1', name: 'a.txt', hasRenditions: false })
    await flushPromises()
    const accessTab = () => w.findAll('button').find((b) => b.text() === 'Access')!
    await accessTab().trigger('click')
    expect(accessTab().classes()).toContain('active')
    // An ACL grant/revoke emits @changed -> loadAll(uid); the tab must not reset.
    w.findComponent({ name: 'AclEditor' }).vm.$emit('changed')
    await flushPromises()
    expect(accessTab().classes()).toContain('active')
  })
})


describe('FileDetailsDrawer — ?tab= deep links', () => {
  // Every row in the Dashboard's Sharing panel and every share attention item
  // links to a resource's SHARE tab. The drawer's tab is local state, so
  // without honouring the query they all land on Info and the deep link
  // silently under-delivers.
  const open = () => openWith({ uid: 'f1', name: 'plans.pdf', hasRenditions: false })

  afterEach(() => { routeStub.query = {} })

  it('opens on Info when no tab is asked for', async () => {
    const w = open()
    await flushPromises()
    expect(w.find('.tabs button.active').text()).toBe('Info')
  })

  it('selects the tab named in the query, case-insensitively', async () => {
    routeStub.query = { tab: 'versions' }
    const w = open()
    await flushPromises()
    expect(w.find('.tabs button.active').text()).toBe('Versions')
  })

  it('falls back to the default for a tab that is not available', async () => {
    // 'Share' is permission-gated; a link to it from a user without the role
    // must not select a pane that is not there.
    routeStub.query = { tab: 'Share' }
    const w = open()
    await flushPromises()
    expect(w.find('.tabs button.active').text()).toBe('Info')
  })

  it('ignores a tab name that does not exist at all', async () => {
    routeStub.query = { tab: 'nonsense' }
    const w = open()
    await flushPromises()
    expect(w.find('.tabs button.active').text()).toBe('Info')
  })
})


describe('FileDetailsDrawer — who sees the Share tab', () => {
  // The tab is a POLICY gate (who may share outside), not a security one. What
  // stops an admin's link carrying admin reach is the role stripping applied at
  // redemption in share_service — a separate mechanism at the other end.
  const open = () => openWith({ uid: 'f1', name: 'plans.pdf', hasRenditions: false })

  function setRoles(roles: string[], level: string) {
    const auth = useAuthStore()
    auth.roles = roles
    auth.accessLevel = level as never
  }

  it('shows it to someone in the share_external group', async () => {
    setRoles(['users', 'share_external'], 'editor')
    const w = open()
    await flushPromises()
    expect(w.findAll('.tabs button').map((b) => b.text())).toContain('Share')
  })

  it('shows it to an administrator who is NOT in the group', async () => {
    // The reported symptom: an admin saw no Share tab at all and reasonably
    // concluded the feature was broken.
    setRoles(['users', 'administrators'], 'admin')
    const w = open()
    await flushPromises()
    expect(w.findAll('.tabs button').map((b) => b.text())).toContain('Share')
  })

  it('hides it from an ordinary user with neither', async () => {
    setRoles(['users', 'engineering'], 'editor')
    const w = open()
    await flushPromises()
    expect(w.findAll('.tabs button').map((b) => b.text())).not.toContain('Share')
  })
})


describe('FileDetailsDrawer — Info tab provenance', () => {
  // The same "came from outside" fact the file list badges, on the tab someone
  // opens when they want to know about ONE file.
  const open = () => openWith({ uid: 'f1', name: 'plans.pdf', hasRenditions: false })

  beforeEach(() => {
    provenance.mockReset()
    provenance.mockResolvedValue({})
  })

  it('says nothing for an ordinary internal file', async () => {
    // The common case. An "internal" row on every file would be noise that
    // trains people to stop reading the list.
    const w = open()
    await flushPromises()
    expect(w.text()).not.toMatch(/from outside/i)
  })

  it('names the verified sender and who let them in', async () => {
    provenance.mockResolvedValue({
      f1: { email: 'bob@contractor.example', at: '2026-08-20T10:00:00Z',
            shared_by: 'alice', stored_name: 'plans.pdf' },
    })
    const w = open()
    await flushPromises()
    expect(w.text()).toMatch(/from outside/i)
    expect(w.text()).toContain('bob@contractor.example')
    expect(w.text()).toContain('alice')
  })

  it('mentions the arrival name only when it differs', async () => {
    // A collision renamed it on the way in, and the renamed value is what the
    // sender was told — so it is the name they will use when they ask.
    provenance.mockResolvedValue({
      f1: { email: 'bob@x.example', at: '2026-08-20T10:00:00Z',
            shared_by: 'alice', stored_name: 'plans (1).pdf' },
    })
    const w = open()
    await flushPromises()
    expect(w.text()).toContain('plans (1).pdf')
  })

  it('stays quiet when the name is unchanged', async () => {
    provenance.mockResolvedValue({
      f1: { email: 'bob@x.example', at: '2026-08-20T10:00:00Z',
            shared_by: 'alice', stored_name: 'plans.pdf' },
    })
    const w = open()
    await flushPromises()
    expect(w.text()).not.toMatch(/arrived as/i)
  })

  it('opens normally when sharing is switched off for the deployment', async () => {
    // That is a 404. A drawer that fails to open because an OPTIONAL service is
    // absent would be a poor trade for one extra row.
    provenance.mockRejectedValue(new Error('404'))
    const w = open()
    await flushPromises()
    expect(w.find('.tabs').exists()).toBe(true)
    expect(w.text()).not.toMatch(/from outside/i)
  })
})

describe('FileDetailsDrawer — click-off closes', () => {
  let appRoot: HTMLElement

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    fns.stat.mockResolvedValue({ uid: 'f1', name: 'x', type: 'file', size: 1, owner: 'u', version: 'v1' })
    fns.getMetadata.mockResolvedValue({})
    fns.checkPermission.mockResolvedValue(true)
    fns.generatePreview.mockResolvedValue({ status: 'indexed', renditions: [], hasMarkdown: true })
    fns.loadRenditionSet.mockResolvedValue({})
    fns.modelRendition.mockReturnValue(undefined)
    // The handler distinguishes "the page behind" from "a teleported popover" by
    // asking whether the click landed inside #app, so the tests need a real one.
    appRoot = document.createElement('div')
    appRoot.id = 'app'
    document.body.appendChild(appRoot)
  })

  afterEach(() => {
    appRoot.remove()
    document.body.innerHTML = ''
  })

  function openAttached() {
    const files = useFileStore()
    files.detailItem = {
      uid: 'f1', name: 'a.txt', hasRenditions: false, isDirectory: false, type: 'file',
      size: 1, renditionCount: 1, deleted: false, createdAt: 0, modifiedAt: 0,
      owner: '', createdBy: '', modifiedBy: '',
    }
    files.drawerOpen = true
    return mount(FileDetailsDrawer, { attachTo: appRoot })
  }

  const down = (el: Element) =>
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))

  it('closes when the click lands on the page behind it', async () => {
    const files = useFileStore()
    openAttached()
    await flushPromises()
    const behind = document.createElement('div')
    appRoot.appendChild(behind)

    down(behind)
    await flushPromises()

    expect(files.drawerOpen).toBe(false)
  })

  it('stays open when the click is inside the drawer', async () => {
    const files = useFileStore()
    const w = openAttached()
    await flushPromises()

    down(w.find('.drawer').element)
    await flushPromises()

    expect(files.drawerOpen).toBe(true)
  })

  it('stays open when the click is in a popover teleported to <body>', async () => {
    // The ACL editor's principal autocomplete teleports its suggestions out of
    // the drawer. Choosing a name from it must not close the drawer underneath.
    const files = useFileStore()
    openAttached()
    await flushPromises()
    const menu = document.createElement('ul')
    menu.className = 'pp-menu'
    document.body.appendChild(menu)   // outside #app, like every Teleport here

    down(menu)
    await flushPromises()

    expect(files.drawerOpen).toBe(true)
  })

  it('does nothing once the drawer is already closed', async () => {
    const files = useFileStore()
    openAttached()
    await flushPromises()
    files.closeDetails()
    await flushPromises()

    const behind = document.createElement('div')
    appRoot.appendChild(behind)
    down(behind)
    await flushPromises()

    expect(files.drawerOpen).toBe(false)
  })
})

// The background poll must be invisible to an open drawer. Not just "still
// open": the pane you are on and the request the drawer already made must both
// survive, or a rescan silently throws away half-typed metadata and bounces you
// back to Info every few seconds.
describe('FileDetailsDrawer — survives a background rescan', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    uid: 'f1', name: 'a.txt', type: 'file' as const, size: 1, isDirectory: false,
    renditionCount: 0, hasRenditions: false, deleted: false, createdAt: 0,
    modifiedAt: 0, owner: '', createdBy: '', modifiedBy: '', ...over,
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routeStub.query = {}
    fns.stat.mockResolvedValue({ uid: 'f1', name: 'a.txt', type: 'file', size: 1, owner: 'u', version: 'v1' })
    fns.getMetadata.mockResolvedValue({})
    fns.checkPermission.mockResolvedValue(true)
    fns.loadRenditionSet.mockResolvedValue({})
    fns.modelRendition.mockReturnValue(undefined)
    provenance.mockResolvedValue({})
  })

  it('keeps the drawer open, on its tab, without refetching', async () => {
    const files = useFileStore()
    files.items = [row()]
    const w = openWith({ uid: 'f1', name: 'a.txt', hasRenditions: false })
    await flushPromises()

    // Land on a tab other than the default, as a user reading permissions would.
    const access = w.findAll('.tabs button').find((b) => b.text() === 'Access')!
    await access.trigger('click')
    expect((w.vm as unknown as { tab: string }).tab).toBe('Access')
    const statCalls = fns.stat.mock.calls.length

    // A rescan that sees a change: same file, new version (size + mtime move),
    // plus a sibling appearing.
    fns.listDirectory.mockResolvedValue([
      row({ size: 42, modifiedAt: 99 }),
      row({ uid: 'f2', name: 'b.txt' }),
    ])
    await files.refresh()
    await flushPromises()

    expect(files.drawerOpen).toBe(true)
    expect(files.detailItem?.uid).toBe('f1')
    // The row moved on underneath, and the drawer moved with it.
    expect(files.detailItem?.size).toBe(42)
    // …without re-running loadAll, which would reset the tab and re-request
    // everything the drawer already has.
    expect((w.vm as unknown as { tab: string }).tab).toBe('Access')
    expect(fns.stat.mock.calls.length).toBe(statCalls)
  })
})

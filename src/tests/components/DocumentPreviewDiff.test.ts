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

// The comparison side of the preview surface: a comparison requested elsewhere
// (the version list's Compare) has to arrive HERE, beside the discussion rail,
// rather than in a window of its own. Kept apart from DocumentPreview.test.ts
// because these need a live difference store rather than an idle stub.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const { getWhenReady } = vi.hoisted(() => ({ getWhenReady: vi.fn() }))
const { openModel } = vi.hoisted(() => ({ openModel: vi.fn() }))
const { previewClose } = vi.hoisted(() => ({ previewClose: vi.fn() }))

// One shared object so a test can set the request and watch the surface react —
// which is the whole behaviour under test.
const diffStore = vi.hoisted(() => ({
  store: { uid: '', name: '', target: '', base: '', close: vi.fn() },
}))

vi.mock('@/services/differenceService', () => ({ differenceService: { getWhenReady } }))
vi.mock('@/stores/difference', () => ({ useDifferenceStore: () => diffStore.store }))
vi.mock('@/stores/model3d', () => ({ useModel3dStore: () => ({ open: openModel }) }))
vi.mock('@/stores/preview', () => ({
  usePreviewStore: () => ({ open: vi.fn(), close: previewClose }),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ tenant: 'default' }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ query: {} }) }))

vi.mock('@/services/renditions', () => ({
  loadRenditionSet: vi.fn().mockResolvedValue({}),
  renditionObjectUrl: vi.fn(),
  renditionText: vi.fn(),
  revokeRenditionUrl: vi.fn(),
  previewImage: () => undefined,
}))
vi.mock('@/services/searchService', () => ({ searchService: { generatePreview: vi.fn() } }))
vi.mock('@/services/fileService', () => ({
  fileService: { downloadFile: vi.fn(), checkPermission: vi.fn().mockResolvedValue(false) },
}))
vi.mock('@/services/apiClient', () => ({ errorMessage: (_e: unknown, m: string) => m }))

vi.mock('@/components/ThreadPanel.vue', () => ({ default: { name: 'ThreadPanel', render: () => null } }))
vi.mock('@/components/ThreadOverlay.vue', () => ({ default: { name: 'ThreadOverlay', render: () => null } }))
vi.mock('@/components/PdfViewer.vue', () => ({ default: { name: 'PdfViewer', props: ['src'], render: () => null } }))
vi.mock('@/components/VersionPairPicker.vue', () => ({
  default: { name: 'VersionPairPicker', props: ['uid', 'base', 'target', 'busy'], render: () => null },
}))
vi.mock('@/components/DiffPageViewer.vue', () => ({
  default: {
    name: 'DiffPageViewer',
    props: ['pages', 'initialPage', 'initialView'],
    render(this: { pages: unknown[] }) {
      return h('div', { class: 'dpv-stub', 'data-pages': String(this.pages.length) })
    },
  },
}))

import DocumentPreview from '@/components/DocumentPreview.vue'

const PAGES = [
  { index: 0, name: 'p0.svg', uid: 'c0', mode: 'vector', kind: 'page' },
  { index: 1, name: 'p1.svg', uid: 'c1', mode: 'vector', kind: 'page' },
]

function ready(over: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    fileUid: 'f1',
    baseVersion: '2026-08-16T09:00:00',
    targetVersion: '2026-08-17T10:00:00',
    manifest: { plugin: 'pdf', plugin_version: 3, key: 'abc123' },
    children: PAGES,
    is3d: false,
    ...over,
  }
}

function request(target = '2026-08-17T10:00:00', base = '2026-08-16T09:00:00') {
  Object.assign(diffStore.store, { uid: 'f1', name: 'plan.pdf', target, base })
}

function surface() {
  // full-width: the review surface. The drawer mounts this too, as a thumbnail,
  // and must NOT answer a comparison request — see the last test.
  return mount(DocumentPreview, {
    props: { uid: 'f1', name: 'plan.pdf', fullWidth: true, hasRenditions: true },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(diffStore.store, { uid: '', name: '', target: '', base: '' })
  getWhenReady.mockResolvedValue(ready())
})

describe('a comparison requested elsewhere lands on this surface', () => {
  it('runs and shows the requested pair', async () => {
    request()
    const w = surface()
    await flushPromises()

    expect(getWhenReady).toHaveBeenCalledWith('f1', expect.objectContaining({
      version: '2026-08-17T10:00:00', base: '2026-08-16T09:00:00',
    }), expect.anything())
    expect(w.get('.dpv-stub').attributes('data-pages')).toBe('2')
  })

  it('leaves the drawer thumbnail alone', async () => {
    // A comparison rendered in a 200px strip helps nobody, and the drawer mounts
    // this same component.
    request()
    mount(DocumentPreview, { props: { uid: 'f1', name: 'plan.pdf', hasRenditions: true } })
    await flushPromises()
    expect(getWhenReady).not.toHaveBeenCalled()
  })

  it('ignores a request naming a different file', async () => {
    request()
    diffStore.store.uid = 'other'
    mount(DocumentPreview, { props: { uid: 'f1', name: 'plan.pdf', fullWidth: true } })
    await flushPromises()
    expect(getWhenReady).not.toHaveBeenCalled()
  })
})

describe('what the comparison can be commented on', () => {
  it('anchors to the versions the service resolved, not the ones requested', async () => {
    // The reader may have taken the defaults ("newest", "its predecessor"). An
    // anchor that said "newest" would point somewhere else after the next upload,
    // so the anchor has to come from the RESULT.
    Object.assign(diffStore.store, { uid: 'f1', name: 'plan.pdf', target: '', base: '' })
    const w = surface()
    await flushPromises()

    const anchor = (w.vm as unknown as { diffView: { anchor: Record<string, unknown> } })
      .diffView.anchor
    expect(anchor).toMatchObject({
      kind: 'diff-view',
      file_uid: 'f1',
      base: '2026-08-16T09:00:00',
      target: '2026-08-17T10:00:00',
      plugin: 'pdf',
      plugin_version: '3',
      manifest_uid: 'abc123',
    })
  })
})

describe('when there is nothing to show', () => {
  it('says why an unsupported type has no comparison', async () => {
    getWhenReady.mockResolvedValue({ status: 'unsupported', children: [], is3d: false })
    request()
    const w = surface()
    await flushPromises()
    expect(w.get('.dp-diff-dead').text()).toContain('no comparison tool')
  })

  it('states a dead end rather than showing an empty comparison', async () => {
    getWhenReady.mockResolvedValue({
      status: 'none', children: [], is3d: false,
      detail: 'The base version was purged.',
    })
    request()
    const w = surface()
    await flushPromises()
    expect(w.get('.dp-diff-dead').text()).toBe('The base version was purged.')
  })
})

describe('3D comparisons belong to the model viewer', () => {
  it('hands off and closes this surface rather than stranding an empty window', async () => {
    getWhenReady.mockResolvedValue(ready({
      is3d: true,
      children: [
        { index: 0, name: 'm.xkt', uid: 'mx', mode: 'xkt', kind: 'model' },
        { index: 1, name: 'm.json', uid: 'mm', mode: 'xkt', kind: 'metamodel' },
      ],
    }))
    request()
    const w = surface()
    await flushPromises()

    expect(openModel).toHaveBeenCalledWith('mx', expect.any(String),
      { xktUid: 'mx', metamodelUid: 'mm' })
    expect(previewClose).toHaveBeenCalled()
    expect(w.find('.dpv-stub').exists()).toBe(false)
  })
})

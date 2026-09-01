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
//
// The discussion dock on the full preview surface follows the discussion
// service. Without it the panel can only report that it cannot reach anything,
// and the user cannot tell that from a document with no comments yet.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h } from 'vue'

const { loadRenditionSet, renditionObjectUrl, renditionText, revokeRenditionUrl, load } =
  vi.hoisted(() => ({
    loadRenditionSet: vi.fn(),
    renditionObjectUrl: vi.fn(),
    renditionText: vi.fn(),
    revokeRenditionUrl: vi.fn(),
    load: vi.fn(),
  }))
vi.mock('@/services/renditions', () => ({
  loadRenditionSet,
  renditionObjectUrl,
  renditionText,
  revokeRenditionUrl,
  isVideoRef: () => false,
  previewImage: (set: { preview?: { ext: string } }) => set?.preview,
}))
vi.mock('@/services/searchService', () => ({ searchService: { generatePreview: vi.fn() } }))
vi.mock('@/services/fileService', () => ({
  fileService: {
    downloadFile: vi.fn(),
    downloadUrl: vi.fn(),
    checkPermission: vi.fn().mockResolvedValue(false),
  },
}))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open: vi.fn(), close: vi.fn() }) }))
vi.mock('@/stores/difference', () => ({
  useDifferenceStore: () => ({ uid: '', name: '', target: '', base: '', close: vi.fn() }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ query: {} }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ tenant: 'default' }) }))
// Stubbed so the assertion is about whether the HOST renders the dock, not
// about what the panel would do once mounted.
vi.mock('@/components/ThreadPanel.vue', () => ({
  default: { name: 'ThreadPanel', render: () => h('div', { class: 'tp-stub' }) },
}))
vi.mock('@/components/ThreadOverlay.vue', () => ({
  default: { name: 'ThreadOverlay', render: () => h('div', { class: 'to-stub' }) },
}))
vi.mock('@/components/PdfViewer.vue', () => ({
  default: { name: 'PdfViewer', props: ['src'], render: () => h('div', { class: 'pv-stub' }) },
}))
vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: { load, reset: vi.fn() },
}))

import DocumentPreview from '@/components/DocumentPreview.vue'
import { resetCapabilities } from '@/composables/useCapabilities'

const caps = (over: Record<string, boolean> = {}) => {
  const on = (k: string) => ({ available: over[k] !== false })
  return {
    editing: { available: true, reason: '', extensions: [] },
    chat: on('chat'), webSearch: on('webSearch'), search: on('search'),
    discussion: on('discussion'), sharing: on('sharing'), difference: on('difference'),
    folderActions: on('folderActions'), bcf: on('bcf'), audit: on('audit'),
  }
}

// full-width is the review surface, which is the only place the dock appears.
const mountPreview = () =>
  mount(DocumentPreview, { props: { uid: 'f1', name: 'report.docx', fullWidth: true } })

describe('DocumentPreview — the discussion dock follows its service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCapabilities()
    loadRenditionSet.mockResolvedValue({})
    renditionObjectUrl.mockResolvedValue('blob:x')
  })

  it('renders the discussion surface where the service is deployed', async () => {
    load.mockResolvedValue(caps())
    const w = mountPreview()
    await flushPromises()
    expect(w.find('.dp-discussion').exists()).toBe(true)
  })

  it('renders nothing for discussion where the service is absent', async () => {
    load.mockResolvedValue(caps({ discussion: false }))
    const w = mountPreview()
    await flushPromises()
    expect(w.find('.dp-discussion').exists()).toBe(false)
    // Including the overlay, which is the other way in.
    expect(w.find('.to-stub').exists()).toBe(false)
  })

  it('leaves the document itself alone — only the discussion is optional', async () => {
    load.mockResolvedValue(caps({ discussion: false }))
    const w = mountPreview()
    await flushPromises()
    expect(w.find('.doc-preview').exists()).toBe(true)
  })

  it('renders the discussion surface while the deployment has not answered', async () => {
    load.mockReturnValue(new Promise(() => {}))
    const w = mountPreview()
    await flushPromises()
    expect(w.find('.dp-discussion').exists()).toBe(true)
  })
})

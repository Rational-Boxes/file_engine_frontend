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
// The two controls a comment can carry that belong to OTHER services: BCF export
// (bcf_services) and the jump to a version comparison (difference_service).
// Both could otherwise only open something that reports it cannot reach
// anything.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { listThreads, flags, listFileReviews, listReviews, load } = vi.hoisted(() => ({
  listThreads: vi.fn(),
  flags: vi.fn(),
  listFileReviews: vi.fn(),
  listReviews: vi.fn(),
  load: vi.fn(),
}))
vi.mock('@/services/discussionService', () => ({
  discussionService: { listThreads, flags, listFileReviews, listReviews },
  extractMentions: () => [],
}))
vi.mock('@/services/discussionLive', () => ({ LiveSession: class { close() {} } }))
vi.mock('@/services/bcfService', () => ({ default: { downloadThreadBcf: vi.fn() } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: 'me' }) }))
vi.mock('@/components/CommentEditor.vue', () => ({ default: { name: 'CommentEditor', render: () => null } }))
vi.mock('@/components/HelpIcon.vue', () => ({ default: { name: 'HelpIcon', render: () => null } }))
vi.mock('@/components/CommentNode.vue', () => ({ default: { name: 'CommentNode', render: () => null } }))
vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: { load, reset: vi.fn() },
}))

import ThreadPanel from '@/components/ThreadPanel.vue'
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

// One comment anchored to a 3D viewpoint (carries the BCF control) and one
// anchored to a comparison (carries the jump).
const threads = [
  { id: 't1', status: 'open', comments: [], anchor: { kind: 'model-viewpoint' } },
  { id: 't2', status: 'open', comments: [], anchor: { kind: 'diff-view' } },
]

const mountPanel = () => mount(ThreadPanel, { props: { fileUid: 'f1' } })

describe('ThreadPanel — controls that belong to other services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCapabilities()
    listThreads.mockResolvedValue(threads)
    flags.mockResolvedValue({})
    listFileReviews.mockResolvedValue([])
    listReviews.mockResolvedValue([])
  })

  it('offers BCF export and the comparison jump when both services are there', async () => {
    load.mockResolvedValue(caps())
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).toContain('BCF')
    expect(w.text()).toContain('View comparison')
  })

  it('hides BCF export where bcf_services is not deployed', async () => {
    load.mockResolvedValue(caps({ bcf: false }))
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).not.toContain('BCF')
    // The comparison jump is a different service and must be unaffected.
    expect(w.text()).toContain('View comparison')
  })

  it('hides the comparison jump where difference_service is not deployed', async () => {
    load.mockResolvedValue(caps({ difference: false }))
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).not.toContain('View comparison')
    expect(w.text()).toContain('BCF')
  })

  it('offers both while the deployment has not answered yet', async () => {
    load.mockReturnValue(new Promise(() => {}))
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).toContain('BCF')
    expect(w.text()).toContain('View comparison')
  })
})

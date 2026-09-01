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
// The in-document surfaces of the optional services: version comparison
// (difference_service) and BCF export (bcf_services). Asserted on what is
// RENDERED, because a capability flag nothing reads suppresses nothing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: { load, reset: vi.fn() },
}))

const { listVersionDetails } = vi.hoisted(() => ({ listVersionDetails: vi.fn() }))
vi.mock('@/services/fileService', () => ({
  fileService: {
    listVersionDetails,
    getVersion: vi.fn(),
    restoreVersion: vi.fn(),
    purgeVersions: vi.fn(),
  },
}))
vi.mock('@/services/apiClient', () => ({ errorMessage: (e: unknown) => String(e) }))

import FileVersions from '@/components/FileVersions.vue'
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

const mountVersions = () =>
  mount(FileVersions, { props: { uid: 'f1', current: 'v3', canManage: true } })

describe('version comparison follows difference_service', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetCapabilities()
    listVersionDetails.mockResolvedValue(
      ['v1', 'v3', 'v2'].map((version) => ({ version, revised_by: '' })),
    )
  })

  it('offers Compare where the service is deployed', async () => {
    load.mockResolvedValue(caps())
    const w = mountVersions()
    await flushPromises()
    expect(w.text()).toContain('Compare selected')
  })

  it('hides Compare where it is not', async () => {
    // The button could only open a viewer that reports it cannot reach
    // anything, so the bar goes with the service.
    load.mockResolvedValue(caps({ difference: false }))
    const w = mountVersions()
    await flushPromises()
    expect(w.text()).not.toContain('Compare selected')
  })

  it('keeps the version list itself, which is not the optional part', async () => {
    // Only the comparison depends on difference_service; history is the core's.
    load.mockResolvedValue(caps({ difference: false }))
    const w = mountVersions()
    await flushPromises()
    expect(w.text()).toContain('v1')
    expect(w.text()).toContain('v2')
  })

  it('offers Compare while the deployment has not answered yet', async () => {
    load.mockReturnValue(new Promise(() => {}))
    const w = mountVersions()
    await flushPromises()
    expect(w.text()).toContain('Compare selected')
  })
})

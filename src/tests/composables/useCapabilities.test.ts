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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: { load, reset: vi.fn() },
}))

import { useCapabilities, resetCapabilities } from '@/composables/useCapabilities'

const caps = (over: Record<string, boolean> = {}) => {
  const on = (k: string) => ({ available: over[k] !== false })
  return {
    editing: { available: over.editing !== false, reason: '', extensions: [] },
    chat: on('chat'),
    webSearch: on('webSearch'),
    search: on('search'),
    discussion: on('discussion'),
    sharing: on('sharing'),
    difference: on('difference'),
    folderActions: on('folderActions'),
    bcf: on('bcf'),
    audit: on('audit'),
  }
}

describe('useCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCapabilities()
  })

  it('starts optimistic, before anything has answered', async () => {
    // A control that appears a moment late looks like a slow page; one that
    // vanishes from a working deployment because a probe had not finished looks
    // like a broken one.
    let resolve!: (v: unknown) => void
    load.mockReturnValue(new Promise((r) => { resolve = r }))
    const { features, ready } = useCapabilities()
    expect(ready.value).toBe(false)
    expect(features.sharing).toBe(true)
    expect(features.audit).toBe(true)
    resolve(caps())
    await flushPromises()
    expect(ready.value).toBe(true)
  })

  it('turns off exactly what the deployment says is off', async () => {
    load.mockResolvedValue(caps({ sharing: false, audit: false, chat: false }))
    const { features } = useCapabilities()
    await flushPromises()
    expect(features.sharing).toBe(false)
    expect(features.audit).toBe(false)
    expect(features.chat).toBe(false)
    // And leaves the rest alone.
    expect(features.discussion).toBe(true)
    expect(features.search).toBe(true)
  })

  it('asks once however many components use it', async () => {
    load.mockResolvedValue(caps())
    useCapabilities()
    useCapabilities()
    useCapabilities()
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('leaves everything on if the answer never comes', async () => {
    load.mockRejectedValue(new Error('down'))
    const { features, ready } = useCapabilities()
    await flushPromises()
    expect(ready.value).toBe(true)
    expect(features.sharing).toBe(true)
    expect(features.audit).toBe(true)
  })
})

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

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/csaiClient', () => ({ default: { get } }))

import { capabilitiesService } from '@/services/capabilitiesService'

const reply = (editing: Record<string, unknown>, rest: Record<string, unknown> = {}) => ({
  data: { editing, ...rest },
})

describe('capabilitiesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capabilitiesService.reset()
  })

  it('reports what the deployment says', async () => {
    get.mockResolvedValue(
      reply({ available: false, reason: 'CSAI_ONLYOFFICE_ENABLED is off', extensions: [] }),
    )
    const c = await capabilitiesService.load()
    expect(c.editing.available).toBe(false)
    expect(c.editing.reason).toContain('CSAI_ONLYOFFICE_ENABLED')
  })

  it('hands through the extension list so the SPA need not keep its own', async () => {
    get.mockResolvedValue(reply({ available: true, reason: '', extensions: ['docx', 'xlsx'] }))
    expect((await capabilitiesService.load()).editing.extensions).toEqual(['docx', 'xlsx'])
  })

  it('asks once and shares the answer', async () => {
    get.mockResolvedValue(reply({ available: true, reason: '', extensions: [] }))
    await Promise.all([capabilitiesService.load(), capabilitiesService.load()])
    await capabilitiesService.load()
    // Concurrent callers during startup share one request rather than racing
    // several — the promise itself is the cache.
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('treats an unreachable endpoint as AVAILABLE, not as off', async () => {
    // A deployment on an older release has no such endpoint and answers 404.
    // "I could not ask" is not "it is switched off"; treating it as off would
    // withdraw working features from every deployment not yet upgraded.
    get.mockRejectedValue(new Error('404'))
    const c = await capabilitiesService.load()
    expect(c.editing.available).toBe(true)
    expect(c.chat.available).toBe(true)
    expect(c.search.available).toBe(true)
  })

  it('fills in sections a deployment does not report', async () => {
    // An older service answering a partial document must not read as "off" for
    // the sections it has never heard of.
    get.mockResolvedValue({ data: { editing: { available: true, reason: '', extensions: [] } } })
    const c = await capabilitiesService.load()
    expect(c.chat.available).toBe(true)
    expect(c.webSearch.available).toBe(true)
  })

  it('maps the wire name web_search onto the client name', async () => {
    get.mockResolvedValue(
      reply({ available: true, reason: '', extensions: [] }, { web_search: { available: false } }),
    )
    expect((await capabilitiesService.load()).webSearch.available).toBe(false)
  })
})

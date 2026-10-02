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

// A service found absent is asked again — after a minute, then backing off to a
// ceiling — and one found present is never re-asked or switched off.
//
// Production 2026-10-01: one failed probe hid the comment sidebar for a whole
// session on a discussion service that was up throughout; only signing out
// brought it back. A blip during a deploy must now heal itself within a minute.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const { load, recheck } = vi.hoisted(() => ({ load: vi.fn(), recheck: vi.fn() }))
vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: {
    load,
    recheck,
    recheckable: () => ['discussion', 'sharing', 'difference', 'folderActions', 'bcf', 'audit'],
    reset: vi.fn(),
  },
}))

import {
  useCapabilities, resetCapabilities, RECHECK_FIRST_MS, RECHECK_MAX_MS,
} from '@/composables/useCapabilities'

const caps = (off: string[] = []) => {
  const on = (k: string) => ({ available: !off.includes(k) })
  return {
    editing: { available: !off.includes('editing'), reason: '', extensions: [] },
    chat: on('chat'), webSearch: on('webSearch'), search: on('search'),
    discussion: on('discussion'), sharing: on('sharing'), difference: on('difference'),
    folderActions: on('folderActions'), bcf: on('bcf'), audit: on('audit'),
  }
}

async function started(off: string[]) {
  load.mockResolvedValue(caps(off))
  const c = useCapabilities()
  await flushPromises()
  return c
}

describe('re-checking a service found absent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetCapabilities()
  })
  afterEach(() => {
    resetCapabilities()
    vi.useRealTimers()
  })

  it('a blip heals within a minute', async () => {
    const { features } = await started(['discussion'])
    expect(features.discussion).toBe(false)
    recheck.mockResolvedValue({ discussion: true })
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS)
    expect(recheck).toHaveBeenCalledWith(['discussion'])
    expect(features.discussion).toBe(true)
  })

  it('does nothing while every probed service is present', async () => {
    await started([])
    await vi.advanceTimersByTimeAsync(RECHECK_MAX_MS * 3)
    expect(recheck).not.toHaveBeenCalled()
  })

  it('never re-asks — or switches off — a service that answered', async () => {
    const { features } = await started(['bcf'])
    recheck.mockResolvedValue({ bcf: false })
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS)
    expect(recheck).toHaveBeenLastCalledWith(['bcf'])   // only the absent one
    expect(features.discussion).toBe(true)
    expect(features.sharing).toBe(true)
  })

  it('backs off while a service stays absent, to a ceiling', async () => {
    await started(['bcf'])
    recheck.mockResolvedValue({ bcf: false })
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS)          // 1st at 1 min
    expect(recheck).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS)          // not yet: now 2 min
    expect(recheck).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS)
    expect(recheck).toHaveBeenCalledTimes(2)
    // Long after: no faster than the ceiling.
    recheck.mockClear()
    await vi.advanceTimersByTimeAsync(RECHECK_MAX_MS * 10)
    expect(recheck.mock.calls.length).toBeLessThanOrEqual(11)
    expect(recheck.mock.calls.length).toBeGreaterThanOrEqual(9)
  })

  it('stops once nothing is absent', async () => {
    await started(['discussion'])
    recheck.mockResolvedValue({ discussion: true })
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS)
    recheck.mockClear()
    await vi.advanceTimersByTimeAsync(RECHECK_MAX_MS * 3)
    expect(recheck).not.toHaveBeenCalled()
  })

  it('a failed re-check is not fatal and is tried again', async () => {
    await started(['discussion'])
    recheck.mockRejectedValueOnce(new Error('network'))
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS)
    recheck.mockResolvedValue({ discussion: true })
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS * 2)
    expect(recheck).toHaveBeenCalledTimes(2)
  })

  it('reset cancels a pending re-check', async () => {
    await started(['discussion'])
    resetCapabilities()
    await vi.advanceTimersByTimeAsync(RECHECK_MAX_MS * 2)
    expect(recheck).not.toHaveBeenCalled()
  })
})

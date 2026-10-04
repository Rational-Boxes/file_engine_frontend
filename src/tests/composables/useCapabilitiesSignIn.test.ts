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

// The first capability detection may run signed out, or on an expired token, and
// csai answers that with 401. Production 2026-10-04: the user signed in without a
// reload and the media share never appeared — media is the one flag that starts
// OFF, so a missing csai answer hid exactly it. Two ways back: a sign-in
// re-detects, and an unknown csai answer is re-asked on the back-off timer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const svc = vi.hoisted(() => ({
  load: vi.fn(),
  recheck: vi.fn(async () => ({})),
  recheckCsai: vi.fn(),
  csaiUnknown: vi.fn(() => false),
  reset: vi.fn(),
}))
vi.mock('@/services/capabilitiesService', () => ({
  capabilitiesService: {
    ...svc,
    recheckable: () => ['discussion', 'sharing', 'difference', 'folderActions', 'bcf', 'audit'],
  },
}))

import {
  useCapabilities, resetCapabilities, refreshCapabilities, RECHECK_FIRST_MS,
} from '@/composables/useCapabilities'

const caps = (media: boolean) => ({
  editing: { available: true, reason: '', extensions: [] },
  chat: { available: true }, webSearch: { available: true }, search: { available: true },
  discussion: { available: true }, sharing: { available: true }, difference: { available: true },
  folderActions: { available: true }, bcf: { available: true }, audit: { available: true },
  media: { available: media },
})

describe('media capability after a signed-out first detection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    svc.csaiUnknown.mockReturnValue(false)
    resetCapabilities()
  })
  afterEach(() => { vi.useRealTimers() })

  it('a sign-in re-detects, so media appears without a page reload', async () => {
    svc.load.mockResolvedValueOnce(caps(false))      // signed out: csai said 401
    const { features } = useCapabilities()
    await flushPromises()
    expect(features.media).toBe(false)

    svc.load.mockResolvedValueOnce(caps(true))       // signed in
    await refreshCapabilities()
    expect(svc.reset).toHaveBeenCalled()
    expect(features.media).toBe(true)
  })

  it('an unknown csai answer is re-asked on the timer and media recovers', async () => {
    svc.csaiUnknown.mockReturnValue(true)
    svc.load.mockResolvedValue(caps(false))
    const { features } = useCapabilities()
    await flushPromises()
    expect(features.media).toBe(false)

    svc.recheckCsai.mockImplementation(async () => {
      svc.csaiUnknown.mockReturnValue(false)
      return { media: { available: true } }
    })
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS)
    await flushPromises()
    expect(svc.recheckCsai).toHaveBeenCalledTimes(1)
    expect(features.media).toBe(true)
  })

  it('a csai that answered "no" is not re-asked', async () => {
    svc.load.mockResolvedValue(caps(false))
    useCapabilities()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(RECHECK_FIRST_MS * 2)
    expect(svc.recheckCsai).not.toHaveBeenCalled()
  })
})

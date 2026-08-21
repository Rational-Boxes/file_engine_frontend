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

/**
 * The reachability probe that decides whether sign-in forwards to a tenant's
 * own origin or serves the workspace from the sign-in origin.
 *
 * The asymmetry is the point: forwarding is the preferred outcome, so only a
 * DEFINITE network failure keeps someone put. Anything ambiguous forwards.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tenantOriginReachable, forgetReachability } from '@/utils/tenantReach'

const ORIGIN = 'https://acme.example.com'

beforeEach(() => {
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

function withFetch(impl: (url: string, init: RequestInit) => Promise<unknown>) {
  const spy = vi.fn(impl as never)
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('tenantOriginReachable', () => {
  it('forwards when the origin answers readably', async () => {
    withFetch(async () => ({ ok: true, status: 200 }))
    expect(await tenantOriginReachable(ORIGIN)).toBe(true)
  })

  it('stays put when the host does not resolve at all', async () => {
    // The case this exists for: a tenant whose subdomain was never configured.
    // Both the CORS attempt and the opaque retry fail at the network layer.
    withFetch(async () => { throw new TypeError('Failed to fetch') })
    expect(await tenantOriginReachable(ORIGIN)).toBe(false)
  })

  it('forwards when the origin answers but refuses CORS', async () => {
    // A CORS refusal and a dead host both surface as a rejected fetch, and they
    // are NOT the same thing. A deployment is not obliged to allow cross-origin
    // reads just to satisfy this check, so the opaque retry is what decides.
    let call = 0
    withFetch(async (_url, init) => {
      call++
      if ((init as RequestInit).mode === 'cors') throw new TypeError('CORS')
      return { type: 'opaque', status: 0 }
    })
    expect(await tenantOriginReachable(ORIGIN)).toBe(true)
    expect(call).toBe(2)   // it really did fall through to the second probe
  })

  it('sends no credentials to an origin it has not established is real', async () => {
    const spy = withFetch(async () => ({ ok: true, status: 200 }))
    await tenantOriginReachable(ORIGIN)
    expect((spy.mock.calls[0][1] as RequestInit).credentials).toBe('omit')
  })

  it('treats a non-2xx answer as reachable', async () => {
    // "Is anything serving this name" — not "is it healthy". A 500 still means
    // the subdomain exists and the app can load there.
    withFetch(async () => ({ ok: false, status: 503 }))
    expect(await tenantOriginReachable(ORIGIN)).toBe(true)
  })

  it('caches a verdict rather than probing on every sign-in', async () => {
    const spy = withFetch(async () => ({ ok: true, status: 200 }))
    await tenantOriginReachable(ORIGIN)
    await tenantOriginReachable(ORIGIN)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('can be told to forget a verdict', async () => {
    const spy = withFetch(async () => ({ ok: true, status: 200 }))
    await tenantOriginReachable(ORIGIN)
    forgetReachability(ORIGIN)
    await tenantOriginReachable(ORIGIN)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('caches per origin, not globally', async () => {
    withFetch(async (url) => {
      if (String(url).includes('acme')) return { ok: true, status: 200 }
      throw new TypeError('Failed to fetch')
    })
    expect(await tenantOriginReachable(ORIGIN)).toBe(true)
    expect(await tenantOriginReachable('https://someco.example.com')).toBe(false)
  })

  it('forwards when fetch is unavailable rather than stranding everyone', async () => {
    // A probe that cannot run must not deny every tenant its own origin.
    vi.stubGlobal('fetch', undefined)
    expect(await tenantOriginReachable(ORIGIN)).toBe(true)
  })

  it('refuses an empty origin', async () => {
    expect(await tenantOriginReachable('')).toBe(false)
  })
})

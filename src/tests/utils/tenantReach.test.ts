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
 * The probe that decides whether sign-in forwards to a tenant's own origin or
 * serves the workspace from the sign-in origin.
 *
 * The question is "is OUR app there", not "did something answer" — wildcard DNS
 * makes the weaker question useless, since an unconfigured subdomain typically
 * returns a cheerful error page rather than failing to resolve.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tenantOriginReachable, forgetReachability } from '@/utils/tenantReach'

const ORIGIN = 'https://acme.example.com'
const BRIDGE = { service: 'fileengine-bridge', providers: [], login_subdomain: 'login' }

beforeEach(() => {
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

function withFetch(impl: (url: string, init: RequestInit) => Promise<unknown>) {
  const spy = vi.fn(impl as never)
  vi.stubGlobal('fetch', spy)
  return spy
}

const answers = (body: unknown, ok = true, status = 200) =>
  withFetch(async () => ({ ok, status, json: async () => body }))

describe('tenantOriginReachable', () => {
  it('forwards when a FileEngine bridge identifies itself', async () => {
    answers(BRIDGE)
    expect(await tenantOriginReachable(ORIGIN)).toBe(true)
  })

  it('stays put when the host does not resolve at all', async () => {
    // A tenant whose subdomain was never configured, on a domain without a
    // wildcard: the request fails at the network layer.
    withFetch(async () => { throw new TypeError('Failed to fetch') })
    expect(await tenantOriginReachable(ORIGIN)).toBe(false)
  })

  it('stays put when a wildcard answers with somebody else’s error page', async () => {
    // THE case that motivated identifying the service rather than trusting a
    // reply. Measured against a real unreserved *.ngrok.io host: HTTP 404
    // text/html, not a network failure. "Something answered" would have
    // forwarded the user straight onto that page.
    answers(undefined, false, 404)
    expect(await tenantOriginReachable(ORIGIN)).toBe(false)
  })

  it('stays put when the body is readable but is not our service', async () => {
    // A parked domain that happens to serve JSON is still not a place to hand a
    // session to. Readability is not identity.
    answers({ service: 'someone-elses-api', providers: [] })
    expect(await tenantOriginReachable(ORIGIN)).toBe(false)
  })

  it('stays put when the reply is not JSON at all', async () => {
    withFetch(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('<html>') } }))
    expect(await tenantOriginReachable(ORIGIN)).toBe(false)
  })

  it('stays put when the origin refuses CORS', async () => {
    // Indistinguishable from a dead host at this layer, and that is fine: the
    // marker route sends a wildcard header precisely so a real origin does not
    // land here. An origin too old to send it reads as unreachable, which is
    // the safe direction — the user stays where the app works.
    withFetch(async () => { throw new TypeError('CORS') })
    expect(await tenantOriginReachable(ORIGIN)).toBe(false)
  })

  it('sends no credentials to an origin it has not established is real', async () => {
    const spy = answers(BRIDGE)
    await tenantOriginReachable(ORIGIN)
    expect((spy.mock.calls[0][1] as RequestInit).credentials).toBe('omit')
  })

  it('caches a verdict rather than probing on every sign-in', async () => {
    const spy = answers(BRIDGE)
    await tenantOriginReachable(ORIGIN)
    await tenantOriginReachable(ORIGIN)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('can be told to forget a verdict', async () => {
    const spy = answers(BRIDGE)
    await tenantOriginReachable(ORIGIN)
    forgetReachability(ORIGIN)
    await tenantOriginReachable(ORIGIN)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('caches per origin, not globally', async () => {
    withFetch(async (url) => {
      if (String(url).includes('acme')) return { ok: true, status: 200, json: async () => BRIDGE }
      throw new TypeError('Failed to fetch')
    })
    expect(await tenantOriginReachable(ORIGIN)).toBe(true)
    expect(await tenantOriginReachable('https://someco.example.com')).toBe(false)
  })

  it('forwards when the probe cannot run at all', async () => {
    // No fetch API. Denying every tenant its own origin on the strength of a
    // missing browser feature would be the wrong call.
    vi.stubGlobal('fetch', undefined)
    expect(await tenantOriginReachable(ORIGIN)).toBe(true)
  })

  it('refuses an empty origin', async () => {
    expect(await tenantOriginReachable('')).toBe(false)
  })
})

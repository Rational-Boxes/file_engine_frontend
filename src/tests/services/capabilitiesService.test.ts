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

const { get, axiosGet } = vi.hoisted(() => ({ get: vi.fn(), axiosGet: vi.fn() }))
vi.mock('@/services/csaiClient', () => ({ default: { get } }))
vi.mock('axios', () => ({ default: { get: axiosGet } }))
vi.mock('@/utils/tokenStorage', () => ({
  tokenStorage: { getAccessToken: () => 'tok', getActiveTenant: () => 'default' },
}))

// A service that is present answers with JSON.
const present = { status: 200, headers: { 'content-type': 'application/json' }, data: {} }
// A deployment with no location for a service falls through to the SPA, which
// answers index.html with HTTP 200 — the trap the probe exists to catch.
const spaFallback = { status: 200, headers: { 'content-type': 'text/html' }, data: '<!doctype html>' }

import { capabilitiesService } from '@/services/capabilitiesService'

const reply = (editing: Record<string, unknown>, rest: Record<string, unknown> = {}) => ({
  data: { editing, ...rest },
})

describe('capabilitiesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capabilitiesService.reset()
    axiosGet.mockResolvedValue(present)
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

  it('reads media publishing from csai\'s own field name, `publish`', async () => {
    // The SPA once read media.available, which csai never sends — so the media
    // share could never have been offered on a real deployment, while every
    // mocked test passed. This is the wire shape, verbatim.
    get.mockResolvedValue(reply({ available: true, reason: '', extensions: [] },
      { media: { publish: true, reason: '', profiles: ['video-720p-vp9'], fmts: ['media'] } }))
    expect((await capabilitiesService.load()).media.available).toBe(true)
  })

  it('treats media as OFF when csai does not say it can publish', async () => {
    // Not optimistic like the rest: a media share where nothing encodes mints a
    // link that never plays.
    get.mockResolvedValue(reply({ available: true, reason: '', extensions: [] },
      { media: { publish: false, reason: 'no media worker is running' } }))
    expect((await capabilitiesService.load()).media.available).toBe(false)
    capabilitiesService.reset()
    get.mockResolvedValue({ data: { editing: { available: true, reason: '', extensions: [] } } })
    expect((await capabilitiesService.load()).media.available).toBe(false)
  })
})


describe('capabilitiesService — a csai answer that never arrived', () => {
  // Production 2026-10-04: the page opened on an expired token, csai answered 401,
  // the user signed in without reloading, and the media share never appeared —
  // media is the one capability that starts OFF, so the failure was visible only there.
  beforeEach(() => {
    capabilitiesService.reset()
    vi.clearAllMocks()
    axiosGet.mockResolvedValue(present)
  })

  it('marks a failed csai answer as unknown, not as "no"', async () => {
    get.mockRejectedValue(Object.assign(new Error('401'), { response: { status: 401 } }))
    expect((await capabilitiesService.load()).media.available).toBe(false)
    expect(capabilitiesService.csaiUnknown()).toBe(true)
  })

  it('asks csai again, and folds the answer into the shared one', async () => {
    get.mockRejectedValueOnce(new Error('401'))
    await capabilitiesService.load()
    get.mockResolvedValue(reply({ available: true, reason: '', extensions: [] },
      { media: { publish: true, reason: '' } }))
    const got = await capabilitiesService.recheckCsai()
    expect(got?.media?.available).toBe(true)
    expect(capabilitiesService.csaiUnknown()).toBe(false)
    expect((await capabilitiesService.load()).media.available).toBe(true)
  })

  it('a real "no" from csai is an answer, not unknown', async () => {
    get.mockResolvedValue(reply({ available: true, reason: '', extensions: [] },
      { media: { publish: false, reason: 'no media worker is running' } }))
    await capabilitiesService.load()
    expect(capabilitiesService.csaiUnknown()).toBe(false)
  })
})

describe('capabilitiesService — detecting optional services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capabilitiesService.reset()
    get.mockResolvedValue(reply({ available: true, reason: '', extensions: [] }))
  })

  it('treats a JSON answer as the service being present', async () => {
    axiosGet.mockResolvedValue(present)
    const c = await capabilitiesService.load()
    expect(c.discussion.available).toBe(true)
    expect(c.sharing.available).toBe(true)
    expect(c.audit.available).toBe(true)
  })

  it('does NOT treat the SPA fallback as a running service', async () => {
    // The documented failure: with no nginx location for a service the request
    // falls through to `location /` and returns index.html with HTTP 200, which
    // once made a missing audit service look like a front-end type error.
    axiosGet.mockResolvedValue(spaFallback)
    const c = await capabilitiesService.load()
    expect(c.audit.available).toBe(false)
    expect(c.bcf.available).toBe(false)
  })

  it('counts a service that answers 401 as present', async () => {
    // It answered and declined, which is proof it is running.
    axiosGet.mockResolvedValue({ status: 401, headers: {}, data: '' })
    expect((await capabilitiesService.load()).difference.available).toBe(true)
  })

  it('counts 404 and 502 as absent', async () => {
    axiosGet.mockResolvedValue({ status: 502, headers: {}, data: '' })
    expect((await capabilitiesService.load()).folderActions.available).toBe(false)
    capabilitiesService.reset()
    axiosGet.mockResolvedValue({ status: 404, headers: {}, data: '' })
    expect((await capabilitiesService.load()).folderActions.available).toBe(false)
  })

  it('treats a transport failure as available, not absent', async () => {
    // A timeout is "I could not ask". Stripping features off the UI because one
    // probe blipped is worse than leaving them and letting the real call report.
    axiosGet.mockRejectedValue(new Error('timeout'))
    expect((await capabilitiesService.load()).sharing.available).toBe(true)
  })

  it('does not let one absent service hide the others', async () => {
    axiosGet.mockImplementation((url: string) =>
      url.includes('/share') ? Promise.resolve(spaFallback) : Promise.resolve(present))
    const c = await capabilitiesService.load()
    expect(c.sharing.available).toBe(false)
    expect(c.discussion.available).toBe(true)
    expect(c.bcf.available).toBe(true)
  })

  it('probes with the same credentials the real clients send', async () => {
    // An unauthenticated probe would be answered 401 by every service and prove
    // nothing about any of them.
    await capabilitiesService.load()
    const cfg = axiosGet.mock.calls[0][1]
    expect(cfg.headers.Authorization).toBe('Bearer tok')
    expect(cfg.headers['X-Tenant']).toBe('default')
  })

  it('still reports csai features when every probe fails', async () => {
    axiosGet.mockRejectedValue(new Error('down'))
    get.mockResolvedValue(reply({ available: false, reason: 'off', extensions: [] }))
    expect((await capabilitiesService.load()).editing.available).toBe(false)
  })
})

// A "not available" verdict is re-asked; an "available" one is not. Production
// 2026-10-01: one probe failure hid the comment sidebar for a whole session, on a
// discussion service that was up throughout — signing out was the only cure.
describe('capabilitiesService — re-checking what was found absent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capabilitiesService.reset()
    get.mockResolvedValue(reply({ available: true, reason: '', extensions: [] }))
  })

  it('names only the services it detects by probing', () => {
    expect(capabilitiesService.recheckable().sort()).toEqual(
      ['audit', 'bcf', 'difference', 'discussion', 'folderActions', 'sharing'])
  })

  it('re-probes only what it is asked about', async () => {
    axiosGet.mockResolvedValue(present)
    const got = await capabilitiesService.recheck(['discussion'])
    expect(got).toEqual({ discussion: true })
    expect(axiosGet).toHaveBeenCalledTimes(1)
    expect(String(axiosGet.mock.calls[0][0])).toContain('/whoami')
  })

  it('ignores names that are not probed (csai reports its own configuration)', async () => {
    const got = await capabilitiesService.recheck(['chat', 'editing'])
    expect(got).toEqual({})
    expect(axiosGet).not.toHaveBeenCalled()
  })

  it('folds a recovery into the shared answer, so later callers see it', async () => {
    axiosGet.mockResolvedValue({ status: 502, headers: {}, data: '' })
    expect((await capabilitiesService.load()).discussion.available).toBe(false)
    axiosGet.mockResolvedValue(present)
    await capabilitiesService.recheck(['discussion'])
    expect((await capabilitiesService.load()).discussion.available).toBe(true)
  })
})

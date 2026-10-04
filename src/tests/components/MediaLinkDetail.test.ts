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

// MS6 — a media link's status & history, and the four labels that must stay
// honest in the unflattering direction (MEDIA_SHARE.md §10).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { audience, state } = vi.hoisted(() => ({ audience: vi.fn(), state: vi.fn() }))

vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  const svc = { audience, audienceCsv: vi.fn(), flushAudience: vi.fn() }
  return { ...actual, shareService: svc, default: svc }
})
vi.mock('@/services/mediaService', async () => {
  const actual = await vi.importActual<object>('@/services/mediaService')
  return { ...actual, mediaService: { state }, default: { state } }
})

import MediaLinkDetail from '@/components/MediaLinkDetail.vue'
import type { AudienceRow, ShareLink } from '@/services/shareService'

const LINK = {
  link_uid: 'L1', kind: 3, resource_uid: 'vid-1', status: 'active', access_mode: 'claimed',
  media_state: 'ready', media_version: '20261004_050000.000', bytes_consumed: 10 * 2 ** 20,
  max_bytes: 100 * 2 ** 20, duration_ms: 180_000,
} as unknown as ShareLink

function row(over: Partial<AudienceRow>): AudienceRow {
  return {
    email: 'a@example.com', verified: false, on_allowlist: false,
    first_seen_utc: '2026-10-04T10:00:00Z', last_seen_utc: '2026-10-04T10:05:00Z',
    sessions: 1, plays: 1, bytes_served: 1000, coverage_pct: 0, furthest_pct: 0,
    completed: false, completed_utc: '', completion_basis: '', dropoff_seconds: null,
    device_class: '', referer_host: '', link_uid: 'L1', mode: 'claimed',
    coverage_bits: '', has_playback: false, ...over,
  }
}

function aud(rows: AudienceRow[], over: Record<string, unknown> = {}) {
  return { link_uid: 'L1', mode: 'claimed', tracking: true,
           unverified_note: 'These people typed an address to watch.', audience: rows,
           totals: { viewers: rows.length, completed: 0, bytes_served: 0, referers: [],
                     retention: [] }, ...over }
}

async function mountIt(link: Partial<ShareLink> = {}) {
  const w = mount(MediaLinkDetail, { props: { link: { ...LINK, ...link } as ShareLink } })
  await flushPromises()
  return w
}

beforeEach(() => {
  audience.mockReset(); state.mockReset()
  state.mockResolvedValue({ file_uid: 'vid-1', source_version: '20261004_050000.000',
                            mime: 'video/mp4', jobs: [], renditions: [] })
})

describe('MediaLinkDetail', () => {
  it('never shows "no playback data" as 0% watched', async () => {
    audience.mockResolvedValue(aud([row({})]))
    const w = await mountIt()
    const line = w.get('[data-test="watch-line"]').text()
    expect(line).toMatch(/no playback data/)
    expect(line).not.toMatch(/0%/)
  })

  it('leads with coverage and keeps "reached the end" secondary', async () => {
    audience.mockResolvedValue(aud([row({ has_playback: true, coverage_bits: '1' + '0'.repeat(98) + '1',
                                          coverage_pct: 2, furthest_pct: 100 })]))
    const w = await mountIt()
    const line = w.get('[data-test="watch-line"]').text()
    expect(line.indexOf('watched 2%')).toBeLessThan(line.indexOf('reached the end'))
  })

  it('says where they stopped', async () => {
    audience.mockResolvedValue(aud([row({ has_playback: true, coverage_bits: '1'.repeat(10),
                                          coverage_pct: 59, furthest_pct: 59, dropoff_seconds: 107 })]))
    expect((await mountIt()).get('[data-test="watch-line"]').text()).toMatch(/stopped at 1:47/)
  })

  it.each([
    ['beacon+bytes', /\bfinished\b/, /probably|not confirmed/],
    ['bytes-floor', /probably finished/, /not confirmed/],
    ['beacon', /says finished \(not confirmed\)/, /probably/],
  ])('shows the completion basis %s honestly', async (basis, yes, no) => {
    audience.mockResolvedValue(aud([row({ has_playback: basis !== 'bytes-floor',
      coverage_bits: '1'.repeat(10), coverage_pct: 100, completed: true,
      completion_basis: basis as AudienceRow['completion_basis'] })]))
    const line = (await mountIt()).get('[data-test="watch-line"]').text()
    expect(line).toMatch(yes)
    expect(line).not.toMatch(no)
  })

  it('marks typed addresses unverified and says what that means', async () => {
    audience.mockResolvedValue(aud([row({ on_allowlist: true })]))
    const w = await mountIt()
    expect(w.text()).toMatch(/unverified/)
    expect(w.text()).toMatch(/expected/)
    expect(w.get('[data-test="unverified-note"]').text()).toMatch(/typed an address/)
  })

  it('says plainly when nobody has opened it', async () => {
    audience.mockResolvedValue(aud([]))
    expect((await mountIt()).find('[data-test="nobody"]').exists()).toBe(true)
  })

  it('shows an open link as totals and a retention curve, never a roster', async () => {
    audience.mockResolvedValue(aud([row({ email: '' })], {
      mode: 'open', unverified_note: null,
      totals: { viewers: 4, completed: 1, bytes_served: 5 * 2 ** 20, referers: ['client.example'],
                retention: [100, 75, 50, 25] } }))
    const w = await mountIt({ access_mode: 'open' })
    expect(w.get('[data-test="open-totals"]').text()).toMatch(/4 viewers · 1 finished/)
    expect(w.get('[data-test="open-totals"]').text()).toMatch(/client\.example/)
    expect(w.get('[data-test="retention"] polyline').attributes('points')).toBe('0,0 1,25 2,50 3,75')
    expect(w.find('[data-test="viewer"]').exists()).toBe(false)
  })

  it('says a link is preparing, with progress, and that it already works', async () => {
    audience.mockResolvedValue(aud([]))
    state.mockResolvedValue({ file_uid: 'vid-1', source_version: 'v1', mime: 'video/mp4',
      jobs: [{ profile: 'video-720p-vp9', status: 'running', progress_pct: 40,
               started_at: new Date(Date.now() - 40_000).toISOString() }], renditions: [] })
    const w = await mountIt({ media_state: 'pending_media' })
    const t = w.get('[data-test="preparing"]').text()
    expect(t).toMatch(/40%/)
    expect(t).toMatch(/about 60 s left/)
    expect(t).toMatch(/already works/)
    w.unmount()
  })

  it('says a correction is being prepared while the old copy keeps playing', async () => {
    audience.mockResolvedValue(aud([]))
    state.mockResolvedValue({ file_uid: 'vid-1', source_version: '20261005_090000.000',
      mime: 'video/mp4', jobs: [{ profile: 'video-720p-vp9', status: 'running', progress_pct: 10,
                                  started_at: null }], renditions: [] })
    const w = await mountIt()
    expect(w.get('[data-test="correcting"]').text()).toMatch(/viewers see the previous one/)
    w.unmount()
  })

  it('meters egress and gives the publish-elsewhere advice near the limit', async () => {
    audience.mockResolvedValue(aud([]))
    let w = await mountIt()
    expect(w.find('[data-test="publish-elsewhere"]').exists()).toBe(false)
    w = await mountIt({ bytes_consumed: 85 * 2 ** 20 })
    expect(w.get('[data-test="publish-elsewhere"]').text()).toMatch(/PeerTube/)
  })

  it('says when tracking is off rather than drawing empty data', async () => {
    audience.mockResolvedValue(aud([row({})], { tracking: false }))
    expect((await mountIt()).find('[data-test="tracking-off"]').exists()).toBe(true)
  })
})

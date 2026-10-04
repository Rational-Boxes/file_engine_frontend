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

// MS5b's client half (MEDIA_SHARE.md §7.4): the bitmap quantiser and the
// cumulative beacon.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bucketCount, quantise, toBase64, trackPlayback, BEACON_EVERY_S } from '@/utils/playbackBeacon'

describe('quantise', () => {
  it('scrubbing to the end is almost no coverage', () => {
    const bits = quantise([[0, 1], [179, 180]], 180)
    expect(bits.length).toBe(180)
    expect(bits.split('').filter((b) => b === '1').length).toBe(2)
    expect(bits.endsWith('1')).toBe(true)
  })

  it('a gap in the middle stays a gap', () => {
    const bits = quantise([[0, 60], [120, 180]], 180)
    expect(bits.slice(0, 60)).toBe('1'.repeat(60))
    expect(bits.slice(60, 120)).toBe('0'.repeat(60))
  })

  it('caps the width at 1000 buckets for a long recording', () => {
    expect(bucketCount(5400)).toBe(1000)
    expect(bucketCount(0.4)).toBe(1)
  })

  it('encodes most-significant bit first, as the server decodes it', () => {
    // server: "".join(f"{b:08b}" for b in blob)[:buckets]
    expect(atob(toBase64('10000000'))).toBe('\x80')
    expect(atob(toBase64('0000000011'))).toBe('\x00\xc0')
  })
})

function fakeMedia(duration = 100) {
  const el = document.createElement('video')
  let played: Array<[number, number]> = []
  Object.defineProperty(el, 'duration', { get: () => duration })
  Object.defineProperty(el, 'played', { get: () => ({ length: played.length,
    start: (i: number) => played[i][0], end: (i: number) => played[i][1] }) })
  let t = 0
  Object.defineProperty(el, 'currentTime', { get: () => t, set: (v) => { t = v } })
  return { el, setPlayed: (p: Array<[number, number]>) => { played = p }, at: (v: number) => { t = v } }
}

describe('trackPlayback', () => {
  const posts: Array<Record<string, unknown>> = []
  const beacons: Blob[] = []
  beforeEach(() => {
    posts.length = 0
    beacons.length = 0
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      posts.push(JSON.parse(String(init.body)))
      return new Response('{}')
    }))
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true,
      value: (_u: string, blob: Blob) => { beacons.push(blob); return true } })
  })

  it('sends the cumulative state on first play, every 30 s of PLAYBACK, pause and end', async () => {
    const { el, setPlayed, at } = fakeMedia(100)
    const stop = trackPlayback(el, '/b', () => 'hd')
    setPlayed([[0, 0]])
    el.dispatchEvent(new Event('play'))
    expect(posts).toHaveLength(1)
    // 29 s of playback: nothing yet.
    for (let s = 1; s < BEACON_EVERY_S; s++) { at(s); el.dispatchEvent(new Event('timeupdate')) }
    expect(posts).toHaveLength(1)
    at(BEACON_EVERY_S); setPlayed([[0, BEACON_EVERY_S]])
    el.dispatchEvent(new Event('timeupdate'))
    expect(posts).toHaveLength(2)
    expect(posts[1].buckets).toBe(100)
    expect(posts[1].furthest_ms).toBe(30_000)
    el.dispatchEvent(new Event('pause'))
    setPlayed([[0, 100]])
    el.dispatchEvent(new Event('ended'))
    const last = posts[posts.length - 1]
    expect(last.ended).toBe(true)
    expect(last.watch_ms).toBe(100_000)
    // Cumulative: the last post's bitmap is the whole of what was played.
    expect(atob(String(last.coverage)).length).toBe(13)
    expect(Object.keys(last)).not.toContain('coverage_pct')   // the server counts
    stop()
  })

  it('a seek is not playback, and a paused tab sends nothing', () => {
    const { el, at } = fakeMedia(100)
    const stop = trackPlayback(el, '/b', () => 'hd')
    el.dispatchEvent(new Event('play'))
    at(90); el.dispatchEvent(new Event('timeupdate'))     // a jump, not 90 s watched
    expect(posts).toHaveLength(1)
    stop()
  })

  it('uses sendBeacon when the page is going away', async () => {
    const { el, setPlayed } = fakeMedia(100)
    const stop = trackPlayback(el, '/b', () => 'sd')
    setPlayed([[0, 10]])
    window.dispatchEvent(new Event('pagehide'))
    expect(beacons).toHaveLength(1)
    expect(beacons[0].type).toBe('text/plain')        // a CORS simple request
    const text = await new Promise<string>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.readAsText(beacons[0])            // jsdom's Blob has no .text()
    })
    expect(JSON.parse(text).quality).toBe('sd')
    stop()
  })
})

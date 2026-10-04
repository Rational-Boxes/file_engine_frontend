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
 * Playback telemetry, the player's half (MEDIA_SHARE.md §7.4).
 *
 * Reads `HTMLMediaElement.played` — the browser's own union of every interval
 * actually played, correct across seeks — rather than integrating timeupdate
 * events, and quantises it into a fixed bitmap of min(round(duration), 1000)
 * buckets. It posts the session's CUMULATIVE state, never a delta: a lost
 * beacon costs nothing (the next carries everything) and a duplicate is a
 * no-op (the server merges by union). The server computes every percentage.
 *
 * Sent on first play, every 30 s of PLAYBACK (a paused tab sends nothing), on
 * pause, on ended, and on pagehide / tab hidden via navigator.sendBeacon — the
 * only mechanism that reliably survives a closing tab.
 */
export const BEACON_EVERY_S = 30
export const MAX_BUCKETS = 1000

export type Ranges = Array<[number, number]>

export function rangesOf(tr: TimeRanges): Ranges {
  const out: Ranges = []
  for (let i = 0; i < tr.length; i++) out.push([tr.start(i), tr.end(i)])
  return out
}

export function bucketCount(durationS: number): number {
  return Math.max(1, Math.min(MAX_BUCKETS, Math.round(durationS)))
}

/** A bucket counts as watched when most of it was played. */
export function quantise(played: Ranges, durationS: number): string {
  const n = bucketCount(durationS)
  const width = durationS / n
  const bits: string[] = []
  for (let b = 0; b < n; b++) {
    const lo = b * width
    const hi = lo + width
    let covered = 0
    for (const [s, e] of played) covered += Math.max(0, Math.min(e, hi) - Math.max(s, lo))
    bits.push(covered >= width * 0.5 ? '1' : '0')
  }
  return bits.join('')
}

export function toBase64(bits: string): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') bytes[i >> 3] |= 0x80 >> (i & 7)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/** Watch a <video>/<audio> element and report to `url`. Returns a detach. */
export function trackPlayback(el: HTMLMediaElement, url: string,
                              quality: () => string | undefined): () => void {
  let plays = 0
  let rateMax = 1
  let ended = false
  let sincePost = 0
  let lastT = 0

  const payload = () => {
    const d = Number.isFinite(el.duration) ? el.duration : 0
    if (!d) return null
    const played = rangesOf(el.played)
    const bits = quantise(played, d)
    const furthest = played.reduce((m, [, e]) => Math.max(m, e), 0)
    const watched = played.reduce((m, [s, e]) => m + (e - s), 0)
    return JSON.stringify({ buckets: bits.length, coverage: toBase64(bits),
      duration_ms: Math.round(d * 1000), furthest_ms: Math.round(furthest * 1000),
      watch_ms: Math.round(watched * 1000), plays, rate_max: rateMax, ended,
      quality: quality() })
  }
  const post = (useBeacon = false) => {
    const body = payload()
    if (!body) return
    sincePost = 0
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))
    } else {
      void fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' },
                        credentials: 'omit', keepalive: true }).catch(() => {})
    }
  }
  const onPlay = () => { plays += 1; if (plays === 1) post() }
  const onTime = () => {
    const t = el.currentTime
    const dt = t - lastT
    lastT = t
    if (dt > 0 && dt < 2) sincePost += dt            // playback progress, not wall time
    if (sincePost >= BEACON_EVERY_S) post()
  }
  const onRate = () => { rateMax = Math.max(rateMax, el.playbackRate) }
  const onPause = () => post()
  const onEnded = () => { ended = true; post() }
  const onHide = () => { if (document.visibilityState === 'hidden') post(true) }
  const onPageHide = () => post(true)

  el.addEventListener('play', onPlay)
  el.addEventListener('timeupdate', onTime)
  el.addEventListener('ratechange', onRate)
  el.addEventListener('pause', onPause)
  el.addEventListener('ended', onEnded)
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onPageHide)
  return () => {
    el.removeEventListener('play', onPlay)
    el.removeEventListener('timeupdate', onTime)
    el.removeEventListener('ratechange', onRate)
    el.removeEventListener('pause', onPause)
    el.removeEventListener('ended', onEnded)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onPageHide)
  }
}

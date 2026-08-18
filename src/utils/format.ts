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

// Human-readable byte size. Note: file_engine_core currently reports 0 for file
// sizes (a known, deferred core bug), so this will show "0 B" until that's fixed.
export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`
}

// Collapse the middle of a long string with an ellipsis, keeping the start and
// the end (so a filename's extension stays visible): "a-very-long-report.pdf" ->
// "a-very…rt.pdf". Returns the input unchanged when it already fits `max`.
export function truncateMiddle(text: string, max = 40): string {
  const s = text ?? ''
  if (s.length <= max) return s
  const ell = '…'
  const keep = Math.max(1, max - ell.length)
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return s.slice(0, head) + ell + (tail > 0 ? s.slice(s.length - tail) : '')
}

// Human-readable local date-time from a UNIX epoch-seconds value. Returns an em
// dash for 0/falsy/invalid inputs (e.g. an unknown creation/modification time).
export function formatDateTime(epochSeconds: number): string {
  if (!epochSeconds || epochSeconds < 0) return '—'
  const date = new Date(epochSeconds * 1000)
  return isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

// Name a downloaded back-version after the file, with the version id in
// parentheses:  ("report.pdf", "20260626_164538") -> "report (20260626_164538).pdf".
// Without a name, falls back to the version id (never the blob-URL UUID).
export function versionFilename(name: string, ts: string): string {
  if (!name) return ts
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  return `${base} (${ts})${ext}`
}

// Core version ids are timestamps of the form "YYYYMMDD_HHMMSS.mmm", generated in
// UTC (the core uses gmtime). Render them as a localized, human-readable date-time
// — parse the components as UTC (Date.UTC), NOT local, or the displayed time is
// off by the viewer's UTC offset. Falls back to the raw value if it doesn't match.
/**
 * A version timestamp as `YYYY-MM-DD HH:MM`, in local time.
 *
 * ISO-shaped because that sorts and reads unambiguously for an international
 * audience — 2026-08-18 is the same date everywhere, where 08/18 is not.
 *
 * Cut to the minute deliberately: versions are minutes or hours apart in
 * practice, so seconds and milliseconds are noise that makes two timestamps
 * harder to tell apart at a glance, not easier. Local time, matching
 * formatVersionTimestamp, so the same version never reads as two different
 * moments in two different parts of the UI.
 *
 * Accepts the core's own format (`20260818_055834.440`) and an ISO-ish string,
 * and returns anything else untouched rather than inventing a date.
 */
export function formatVersionMinute(v: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const asLocalMinute = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`

  const core = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/.exec(v || '')
  if (core) {
    const [, y, mo, d, h, mi, s, ms] = core
    const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, ms ? +ms : 0))
    return isNaN(date.getTime()) ? v : asLocalMinute(date)
  }

  // An ISO-ish string (what a test fixture or a future API might hand us).
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v || '')) {
    const date = new Date(v)
    if (!isNaN(date.getTime())) return asLocalMinute(date)
    return v.replace('T', ' ').slice(0, 16)   // unparseable but well-formed: just trim
  }

  return v || '—'
}

export function formatVersionTimestamp(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/.exec(v || '')
  if (!m) return v || '—'
  const [, y, mo, d, h, mi, s, ms] = m
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, ms ? +ms : 0))
  return isNaN(date.getTime()) ? v : date.toLocaleString()
}

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
export function formatVersionTimestamp(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/.exec(v || '')
  if (!m) return v || '—'
  const [, y, mo, d, h, mi, s, ms] = m
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, ms ? +ms : 0))
  return isNaN(date.getTime()) ? v : date.toLocaleString()
}

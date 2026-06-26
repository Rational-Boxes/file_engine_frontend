// Human-readable byte size. Note: file_engine_core currently reports 0 for file
// sizes (a known, deferred core bug), so this will show "0 B" until that's fixed.
export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`
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

// Core version ids are timestamps of the form "YYYYMMDD_HHMMSS.mmm". Render them
// as a localized, human-readable date-time. Falls back to the raw value if it
// doesn't match (e.g. an unexpected id shape).
export function formatVersionTimestamp(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/.exec(v || '')
  if (!m) return v || '—'
  const [, y, mo, d, h, mi, s, ms] = m
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s, ms ? +ms : 0)
  return isNaN(date.getTime()) ? v : date.toLocaleString()
}

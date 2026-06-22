// Human-readable byte size. Note: file_engine_core currently reports 0 for file
// sizes (a known, deferred core bug), so this will show "0 B" until that's fixed.
export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`
}

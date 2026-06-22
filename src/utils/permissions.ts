// Shared permission/operation vocabulary so the file browser and details drawer
// gate the UI consistently. The bridge/core remain the real authority (they
// enforce per-node ACLs); this only decides what to show/enable.

export type AccessLevel = 'user' | 'editor' | 'admin'

// The permission letters the bridge understands (subset shown in the UI).
export const PERMS: { key: string; label: string }[] = [
  { key: 'r', label: 'Read' },
  { key: 'w', label: 'Write' },
  { key: 'x', label: 'Execute' },
  { key: 'd', label: 'Delete' },
  { key: 'm', label: 'Manage ACL' },
]

// File operations and the minimum access level that may attempt each. Coarse
// UI gating; the backend still enforces the real ACL.
export type FileAction = 'open' | 'download' | 'info' | 'rename' | 'delete'

const ACTION_MIN_LEVEL: Record<FileAction, AccessLevel> = {
  open: 'user',
  download: 'user',
  info: 'user',
  rename: 'editor',
  delete: 'editor',
}

const RANK: Record<AccessLevel, number> = { user: 1, editor: 2, admin: 3 }

export function canDo(action: FileAction, level: AccessLevel): boolean {
  return RANK[level] >= RANK[ACTION_MIN_LEVEL[action]]
}

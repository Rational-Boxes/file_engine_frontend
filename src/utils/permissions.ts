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

// Full permission bit table — mirrors the core Permission enum (acl_manager.h).
// An ACL entry's `permissions` field (GET /v1/nodes/{uid}/acls) is a bitmask of
// these, so the editor can decode a stored entry into its constituent letters.
export interface PermBit {
  key: string
  label: string
  bit: number
}
export const PERM_BITS: PermBit[] = [
  { key: 'r', label: 'Read', bit: 0x400 },
  { key: 'w', label: 'Write', bit: 0x200 },
  { key: 'x', label: 'Execute', bit: 0x001 },
  { key: 'd', label: 'Delete', bit: 0x100 },
  { key: 'l', label: 'List deleted', bit: 0x080 },
  { key: 'u', label: 'Undelete', bit: 0x040 },
  { key: 'v', label: 'View versions', bit: 0x020 },
  { key: 'b', label: 'Retrieve version', bit: 0x010 },
  { key: 's', label: 'Restore version', bit: 0x008 },
  { key: 'm', label: 'Manage ACL', bit: 0x800 },
  { key: 'i', label: 'Inherit', bit: 0x1000 },
]

// The set bits of a permission bitmask, in display order.
export function decodePermissions(mask: number): PermBit[] {
  return PERM_BITS.filter((p) => (mask & p.bit) !== 0)
}

// File operations and the minimum access level that may attempt each. Coarse
// UI gating; the backend still enforces the real ACL.
export type FileAction =
  | 'open' | 'download' | 'info' | 'rename' | 'delete' | 'cut' | 'copy' | 'paste'

const ACTION_MIN_LEVEL: Record<FileAction, AccessLevel> = {
  open: 'user',
  download: 'user',
  info: 'user',
  rename: 'editor',
  delete: 'editor',
  copy: 'user', // copy only reads the source
  cut: 'editor', // moving removes from the source
  paste: 'editor', // writing into the target directory
}

const RANK: Record<AccessLevel, number> = { user: 1, editor: 2, admin: 3 }

export function canDo(action: FileAction, level: AccessLevel): boolean {
  return RANK[level] >= RANK[ACTION_MIN_LEVEL[action]]
}

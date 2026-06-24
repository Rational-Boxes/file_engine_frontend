// Cross-feature shared types for the advanced-feature workstreams (ACL editor,
// renditions/preview, versioning, search, RAG chat). Service modules and stores
// import from here so the wire shapes are defined once.

// --- Principals (ACL editor type-ahead: GET /v1/principals) ---
export type PrincipalKind = 'user' | 'role' | 'claim'

export interface Principal {
  kind: PrincipalKind
  value: string // bare user id, role name, or "key=value" claim
}

// Raw response of GET /v1/principals?types=role,claim,user
export interface PrincipalSuggestions {
  users: string[]
  roles: string[]
  claims: string[]
}

// Encode a Principal into the bridge's ACL wire form: users are bare, roles use
// the "role:" prefix, claims use "claim:". Mirrors the core's principal parsing.
export function encodePrincipal(p: Principal): string {
  if (p.kind === 'role') return `role:${p.value}`
  if (p.kind === 'claim') return `claim:${p.value}`
  return p.value
}

// --- ACLs (GET/POST/DELETE /v1/nodes/{uid}/permissions) ---
export type AclEffect = 'allow' | 'deny'

export interface AclEntry {
  principal: string // wire form as stored ("dave", "role:editors", "claim:dept=eng")
  type: number // PrincipalType enum (0 user, 1 role, 2 group, 3 other, 4 claim)
  permission: string // permission bits / letters
  effect: AclEffect
}

// --- Versioning (GET /v1/files/{uid}/versions[...]) ---
export interface Version {
  version: string // version timestamp id
  size?: number
  current?: boolean
}

// --- Search (POST {csai}/search) ---
export interface SearchHit {
  fileUid: string
  name?: string
  score?: number
  snippet?: string
}

// --- RAG chat (WS {csai}/chat) ---
export interface Citation {
  fileUid: string
  name?: string
  ordinal?: number
}

// Discriminated union of the server's streamed chat events.
export type ChatEvent =
  | { type: 'token'; text: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'done' }
  | { type: 'error'; error: string }

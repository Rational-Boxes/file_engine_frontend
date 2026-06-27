// Cross-feature shared types for the advanced-feature workstreams (ACL editor,
// renditions/preview, versioning, search, RAG chat). Service modules and stores
// import from here so the wire shapes are defined once.

// --- Principals (ACL editor type-ahead: GET /v1/principals) ---
// 'everyone' is the OTHER catch-all (every user); selecting it grants/denies to
// all principals — e.g. a DENY READ to hide a resource from everyone.
export type PrincipalKind = 'user' | 'role' | 'claim' | 'everyone'

export interface Principal {
  kind: PrincipalKind
  value: string // bare user id, role name, "key=value" claim, or "everyone"
}

// Raw response of GET /v1/principals?types=role,claim,user
export interface PrincipalSuggestions {
  users: string[]
  roles: string[]
  claims: string[]
}

// Encode a Principal into the bridge's ACL wire form: users are bare, roles use
// the "role:" prefix, claims use "claim:", and the everyone group is the bare
// literal "everyone" (the core maps "everyone"/"other" to the OTHER type). For
// 'everyone' we pass the stored value through so a revoke targets the exact row
// (an existing default entry may be stored as "other"). Mirrors core parsing.
export function encodePrincipal(p: Principal): string {
  if (p.kind === 'role') return `role:${p.value}`
  if (p.kind === 'claim') return `claim:${p.value}`
  return p.value
}

// --- ACLs (GET /v1/nodes/{uid}/acls; grant/revoke via …/permissions) ---
export type AclEffect = 'allow' | 'deny'

export interface AclEntry {
  principal: string // bare principal as stored ("dave", "editors", "dept=eng")
  type: number // PrincipalType enum (0 user, 1 role, 2 group, 3 other, 4 claim)
  permissions: number // permission bitmask
  effect: AclEffect
}

// Map a stored ACL principal type to a type-ahead PrincipalKind. type 3 (OTHER)
// and type 2 (GROUP, currently global like OTHER) surface as 'everyone'.
export function principalKindFromType(type: number): PrincipalKind {
  if (type === 1) return 'role'
  if (type === 4) return 'claim'
  if (type === 2 || type === 3) return 'everyone'
  return 'user'
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
// A citation is either a document (file the user may read) or a web result from
// the web_search tool. Both share the [n] marker numbering used in the answer.
export interface Citation {
  marker?: number // 1-based [n] reference used in the answer
  kind?: 'doc' | 'web'
  fileUid?: string // doc citations
  url?: string // web citations
  title?: string // web citations
}

// Discriminated union of the server's streamed chat events.
export type ChatEvent =
  | { type: 'token'; text: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'tool_call'; name: string; args?: Record<string, unknown> }
  | { type: 'tool_result'; name: string }
  | { type: 'done' }
  | { type: 'error'; error: string }

import apiClient from '@/services/apiClient'
import type { Principal, PrincipalSuggestions } from '@/types'

// ACL-editor support. The grant / revoke / point-check operations already live
// on fileService (POST/DELETE/GET /v1/nodes/{uid}/permissions); this module adds
// the principal **type-ahead** that backs the ACL editor's add-principal control,
// powered by the bridge's GET /v1/principals (users via LDAP, roles via the role
// registry, claims via the core claim catalog).
//
// NOTE: listing a node's existing ACL entries needs a bridge endpoint that does
// not exist yet (the core exposes Grant/Revoke/Check/GetEffective, but not a
// "list ACLs for resource" RPC) — tracked as a backend dependency in the SPA
// integration plan (§3).

export type PrincipalType = 'user' | 'role' | 'claim'

export const aclService = {
  // Type-ahead over roles, claims, and users for the ACL editor. `query` is a
  // case-insensitive prefix; `types` selects categories (default all three);
  // `limit` caps each category.
  async searchPrincipals(
    query: string,
    opts: { types?: PrincipalType[]; limit?: number } = {},
  ): Promise<PrincipalSuggestions> {
    const params: Record<string, string> = {}
    if (query) params.q = query
    if (opts.types?.length) params.types = opts.types.join(',')
    if (opts.limit && opts.limit > 0) params.limit = String(opts.limit)
    const { data } = await apiClient.get<Partial<PrincipalSuggestions>>('/v1/principals', { params })
    return { users: data?.users ?? [], roles: data?.roles ?? [], claims: data?.claims ?? [] }
  },
}

// Flatten categorized suggestions into a single ordered list of typed principals
// for a type-ahead dropdown: users first, then roles, then claims.
export function suggestionsToPrincipals(s: PrincipalSuggestions): Principal[] {
  return [
    ...s.users.map((value): Principal => ({ kind: 'user', value })),
    ...s.roles.map((value): Principal => ({ kind: 'role', value })),
    ...s.claims.map((value): Principal => ({ kind: 'claim', value })),
  ]
}

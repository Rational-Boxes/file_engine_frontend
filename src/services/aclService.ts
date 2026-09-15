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

import apiClient from '@/services/apiClient'
import type { AclEntry, Principal, PrincipalSuggestions } from '@/types'
import { isSystemRole } from '@/utils/systemRoles'

interface RawAclEntry {
  principal: string
  type: number
  permissions: number
  effect: number
}

// ACL-editor support:
//   - getAcls(uid)        list a node's current ACL entries (GET …/acls)
//   - searchPrincipals()  the add-principal type-ahead (GET /v1/principals)
// grant / revoke / point-check live on fileService (POST/DELETE/GET
// /v1/nodes/{uid}/permissions). Type-ahead sources: users via LDAP, roles via
// the role registry, claims via the core claim catalog.

export type PrincipalType = 'user' | 'role' | 'claim'

export const aclService = {
  // List a node's ACL entries (backs the editor's "current grants" view).
  // Requires MANAGE_ACL on the node (enforced by the core → 403 otherwise).
  async getAcls(uid: string): Promise<AclEntry[]> {
    const { data } = await apiClient.get<{ acls?: RawAclEntry[] }>(`/v1/nodes/${uid}/acls`)
    return (data?.acls ?? [])
      // type 1 is ROLE. The workers' `file_services` grant sits on every tenant
      // root, so without this the editor listed a row an administrator is not
      // meant to manage — and could remove, taking all four workers' access
      // with it. Hidden, not read-only: the entry is platform plumbing, so it
      // is not part of the access picture an administrator is reasoning about.
      // NOTE this means the editor does not show the node's COMPLETE ACL; the
      // core still enforces the hidden grant.
      .filter((a) => !(a.type === 1 && isSystemRole(a.principal)))
      .map((a) => ({
        principal: a.principal,
        type: a.type,
        permissions: a.permissions,
        effect: a.effect === 1 ? 'deny' : 'allow',
      }))
  },

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
    // Roles are filtered so a system role cannot be typed into the add-principal
    // box and granted somewhere new; users and claims pass through untouched.
    return {
      users: data?.users ?? [],
      roles: (data?.roles ?? []).filter((r) => !isSystemRole(r)),
      claims: data?.claims ?? [],
    }
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

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

// Roles that exist to make the platform work, not to be administered.
//
// `file_services` is the per-tenant role the background workers hold
// (difference, discussion, csai, folder_actions). Each worker binds as its own
// `svc-*` account under `ou=services` — deliberately outside `ldap_user_base`,
// so the workers themselves are already invisible to every user-facing lookup
// by construction. The ROLE is not: it is a group under the tenant like
// `administrators`, so it came back from the role registry and showed up in the
// admin UI as though an administrator were meant to do something with it.
//
// Nothing good could come of that. The Roles tab offered a Delete button that
// would have stripped read/write from all four workers; the Users tab offered it
// as something to assign to a person, which would hand them worker-level rights
// across the whole tenant.
//
// Filtering happens at the SERVICE boundary (ldapAdminService, aclService) so
// every consumer is covered once — the tenant-admin Roles and Users tabs, the
// integrations panel, and the ACL editor's add-principal type-ahead — rather
// than each component remembering to do it.
//
// Two things this deliberately does NOT do:
//   * It does not filter the roles carried on a USER record. A person should
//     never hold `file_services`; if one somehow does, that is a mistake an
//     administrator needs to see, not one the UI should hide.
//   * It is presentation only. The API still accepts these names, so the server
//     has to guard itself — see the matching refusal in ldap_manager's roles
//     router (`admin_roles.py`).
export const SYSTEM_ROLES: readonly string[] = ['file_services']

export function isSystemRole(name: string): boolean {
  return SYSTEM_ROLES.includes(name)
}

// Drop system roles from a list of role names.
export function withoutSystemRoles(names: string[]): string[] {
  return names.filter((n) => !isSystemRole(n))
}

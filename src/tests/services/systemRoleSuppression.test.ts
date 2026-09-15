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

// `file_services` is the per-tenant role the four background workers hold. The
// workers live in ou=services and are already invisible everywhere; the ROLE is
// a group under the tenant like `administrators`, so it came back from the role
// registry and surfaced in the admin UI with a Delete button next to it.
//
// The rule is SUPPRESS FROM MANAGEMENT, NOT FROM VIEW, and these tests pin both
// halves of it at the service boundary:
//   listRoles / searchPrincipals  filtered — nothing should offer the role
//   getAcls                       NOT filtered — a read ACL must be complete
// The locked-row half lives in the editor; see AclEditor.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ adminGet: vi.fn(), apiGet: vi.fn() }))

vi.mock('@/services/ldapAdminClient', () => ({ default: { get: h.adminGet } }))
vi.mock('@/services/apiClient', () => ({
  default: { get: h.apiGet },
  errorMessage: (e: unknown) => String(e),
}))

import { ldapAdminService } from '@/services/ldapAdminService'
import { aclService } from '@/services/aclService'
import { isSystemRole, withoutSystemRoles, SYSTEM_ROLES } from '@/utils/systemRoles'

const role = (name: string) => ({ name, dn: `cn=${name}`, member_count: 1 })

describe('systemRoles', () => {
  it('names file_services and matches it exactly', () => {
    expect(SYSTEM_ROLES).toContain('file_services')
    expect(isSystemRole('file_services')).toBe(true)
    // Not a prefix or substring match — a tenant's own role must survive.
    for (const n of ['services', 'file_services_reviewers', 'my_file_services', 'FILE_SERVICES']) {
      expect(isSystemRole(n), n).toBe(false)
    }
    expect(withoutSystemRoles(['editors', 'file_services', 'administrators']))
      .toEqual(['editors', 'administrators'])
  })
})

describe('ldapAdminService.listRoles', () => {
  beforeEach(() => h.adminGet.mockReset())

  it('drops file_services, so no admin surface can offer or delete it', async () => {
    h.adminGet.mockResolvedValue({
      data: [role('administrators'), role('file_services'), role('editors')],
    })
    const names = (await ldapAdminService.listRoles()).map((r) => r.name)
    expect(names).toEqual(['administrators', 'editors'])
  })

  it('leaves an ordinary role whose name merely contains it', async () => {
    h.adminGet.mockResolvedValue({ data: [role('file_services_reviewers')] })
    expect((await ldapAdminService.listRoles()).map((r) => r.name))
      .toEqual(['file_services_reviewers'])
  })

  it('survives an empty body rather than throwing', async () => {
    h.adminGet.mockResolvedValue({ data: undefined })
    await expect(ldapAdminService.listRoles()).resolves.toEqual([])
  })
})

describe('aclService.searchPrincipals', () => {
  beforeEach(() => h.apiGet.mockReset())

  it('keeps file_services out of the add-principal type-ahead', async () => {
    h.apiGet.mockResolvedValue({
      data: { users: ['ann'], roles: ['editors', 'file_services'], claims: ['dept=eng'] },
    })
    const s = await aclService.searchPrincipals('fi')
    expect(s.roles).toEqual(['editors'])
    // Users and claims pass through untouched — this filter is about roles only.
    expect(s.users).toEqual(['ann'])
    expect(s.claims).toEqual(['dept=eng'])
  })
})

describe('aclService.getAcls', () => {
  beforeEach(() => h.apiGet.mockReset())

  // type 1 is ROLE; 0 is USER.
  const acl = (principal: string, type: number) => ({
    principal, type, permissions: 0x1730, effect: 0,
  })

  it('does NOT filter — a read ACL must be the whole ACL', async () => {
    // Deliberately unlike listRoles/searchPrincipals. Dropping a live grant here
    // would make the editor answer "who can reach this?" wrongly; the editor
    // locks the row instead (see the AclEditor tests).
    h.apiGet.mockResolvedValue({
      data: { acls: [acl('james', 0), acl('file_services', 1), acl('editors', 1)] },
    })
    const entries = await aclService.getAcls('root-uid')
    expect(entries.map((e) => e.principal)).toEqual(['james', 'file_services', 'editors'])
  })

  it('still maps effect', async () => {
    h.apiGet.mockResolvedValue({
      data: { acls: [{ principal: 'editors', type: 1, permissions: 0x30, effect: 1 }] },
    })
    expect(await aclService.getAcls('u')).toEqual([
      { principal: 'editors', type: 1, permissions: 0x30, effect: 'deny' },
    ])
  })

  it('survives an empty body rather than throwing', async () => {
    h.apiGet.mockResolvedValue({ data: {} })
    await expect(aclService.getAcls('u')).resolves.toEqual([])
  })
})

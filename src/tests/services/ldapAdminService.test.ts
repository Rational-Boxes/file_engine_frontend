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

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { get, post, put, del, patch } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: vi.fn(),
}))
vi.mock('@/services/ldapAdminClient', () => ({
  default: { get, post, put, delete: del, patch },
  LDAPADMIN_BASE: '/ldapadmin',
}))

import { ldapAdminService } from '@/services/ldapAdminService'

describe('ldapAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists + creates roles', async () => {
    get.mockResolvedValue({ data: [{ name: 'editors', dn: 'cn=editors', member_count: 2 }] })
    expect(await ldapAdminService.listRoles()).toHaveLength(1)
    expect(get).toHaveBeenCalledWith('/v1/admin/roles')
    post.mockResolvedValue({ data: { name: 'r', dn: 'x', member_count: 0 } })
    await ldapAdminService.createRole('r')
    expect(post).toHaveBeenCalledWith('/v1/admin/roles', { name: 'r' })
  })

  it('adds/removes members with encoded path segments', async () => {
    post.mockResolvedValue({ data: {} })
    del.mockResolvedValue({ data: {} })
    await ldapAdminService.addMember('editors', 'a@b.com')
    expect(post).toHaveBeenCalledWith('/v1/admin/roles/editors/members', { uid: 'a@b.com' })
    await ldapAdminService.removeMember('editors', 'a@b.com')
    expect(del).toHaveBeenCalledWith('/v1/admin/roles/editors/members/a%40b.com')
  })

  it('searches users via a query param and creates via invite', async () => {
    get.mockResolvedValue({ data: [] })
    await ldapAdminService.findUsers('ann')
    expect(get).toHaveBeenCalledWith('/v1/admin/users', { params: { query: 'ann' } })
    post.mockResolvedValue({ data: { uid: 'x', email: 'x', display_name: 'X' } })
    await ldapAdminService.createUser('x@y.com', 'X', ['editors'])
    expect(post).toHaveBeenCalledWith('/v1/admin/users', { email: 'x@y.com', display_name: 'X', roles: ['editors'] })
  })

  it('self-service: profile + change password', async () => {
    patch.mockResolvedValue({ data: {} })
    await ldapAdminService.updateProfile({ display_name: 'New' })
    expect(patch).toHaveBeenCalledWith('/v1/me', { display_name: 'New' })
    post.mockResolvedValue({ data: {} })
    await ldapAdminService.changePassword('old', 'new')
    expect(post).toHaveBeenCalledWith('/v1/me/password', { current_password: 'old', new_password: 'new' })
  })

  it('public: reset + policy', async () => {
    post.mockResolvedValue({ data: {} })
    await ldapAdminService.requestReset('a@b.com')
    expect(post).toHaveBeenCalledWith('/v1/reset/request', { email: 'a@b.com' })
    get.mockResolvedValue({ data: { min_length: 12 } })
    expect((await ldapAdminService.passwordPolicy()).min_length).toBe(12)
    expect(get).toHaveBeenCalledWith('/v1/password-policy')
  })
})

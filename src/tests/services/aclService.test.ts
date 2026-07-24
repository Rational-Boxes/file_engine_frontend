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

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/services/apiClient', () => ({
  default: { get },
  errorMessage: (e: unknown) => String(e),
}))

import { aclService, suggestionsToPrincipals } from '@/services/aclService'

describe('aclService.searchPrincipals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries /v1/principals with q, joined types, and limit', async () => {
    get.mockResolvedValue({ data: { users: ['alice'], roles: ['editors'], claims: ['dept=eng'] } })
    const out = await aclService.searchPrincipals('al', { types: ['user', 'role'], limit: 5 })
    expect(get).toHaveBeenCalledWith('/v1/principals', {
      params: { q: 'al', types: 'user,role', limit: '5' },
    })
    expect(out).toEqual({ users: ['alice'], roles: ['editors'], claims: ['dept=eng'] })
  })

  it('omits empty query, empty types, and non-positive limit', async () => {
    get.mockResolvedValue({ data: {} })
    await aclService.searchPrincipals('', { types: [], limit: 0 })
    expect(get).toHaveBeenCalledWith('/v1/principals', { params: {} })
  })

  it('normalizes a partial response to all three arrays', async () => {
    get.mockResolvedValue({ data: { roles: ['r1'] } })
    expect(await aclService.searchPrincipals('r')).toEqual({ users: [], roles: ['r1'], claims: [] })
  })
})

describe('aclService.getAcls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists ACL entries and maps the effect int to allow/deny', async () => {
    get.mockResolvedValue({
      data: {
        acls: [
          { principal: 'dave', type: 0, permissions: 1, effect: 0 },
          { principal: 'editors', type: 1, permissions: 7, effect: 0 },
          { principal: 'erin', type: 0, permissions: 1, effect: 1 },
        ],
      },
    })
    const acls = await aclService.getAcls('f1')
    expect(get).toHaveBeenCalledWith('/v1/nodes/f1/acls')
    expect(acls).toEqual([
      { principal: 'dave', type: 0, permissions: 1, effect: 'allow' },
      { principal: 'editors', type: 1, permissions: 7, effect: 'allow' },
      { principal: 'erin', type: 0, permissions: 1, effect: 'deny' },
    ])
  })

  it('tolerates a missing acls array', async () => {
    get.mockResolvedValue({ data: {} })
    expect(await aclService.getAcls('f1')).toEqual([])
  })
})

describe('suggestionsToPrincipals', () => {
  it('flattens to typed principals: users, then roles, then claims', () => {
    expect(
      suggestionsToPrincipals({ users: ['u1'], roles: ['r1', 'r2'], claims: ['k=v'] }),
    ).toEqual([
      { kind: 'user', value: 'u1' },
      { kind: 'role', value: 'r1' },
      { kind: 'role', value: 'r2' },
      { kind: 'claim', value: 'k=v' },
    ])
  })
})

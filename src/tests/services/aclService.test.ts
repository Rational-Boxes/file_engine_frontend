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

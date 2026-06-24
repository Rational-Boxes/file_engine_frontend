import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({ default: { get, post, put, delete: del } }))

import { roleService } from '@/services/roleService'

describe('roleService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists, creates, and deletes roles', async () => {
    get.mockResolvedValue({ data: { roles: ['admins', 'editors'] } })
    expect(await roleService.listRoles()).toEqual(['admins', 'editors'])
    expect(get).toHaveBeenCalledWith('/v1/roles')

    post.mockResolvedValue({ data: {} })
    await roleService.createRole('writers')
    expect(post).toHaveBeenCalledWith('/v1/roles', { role: 'writers' })

    del.mockResolvedValue({ data: {} })
    await roleService.deleteRole('writers')
    expect(del).toHaveBeenCalledWith('/v1/roles/writers')
  })

  it('lists members and assigns/removes a user (URL-encoded)', async () => {
    get.mockResolvedValue({ data: { users: ['alice'] } })
    expect(await roleService.usersInRole('the role')).toEqual(['alice'])
    expect(get).toHaveBeenCalledWith('/v1/roles/the%20role/users')

    put.mockResolvedValue({ data: {} })
    await roleService.assignUser('editors', 'bob@x.com')
    expect(put).toHaveBeenCalledWith('/v1/roles/editors/users/bob%40x.com')

    del.mockResolvedValue({ data: {} })
    await roleService.removeUser('editors', 'bob@x.com')
    expect(del).toHaveBeenCalledWith('/v1/roles/editors/users/bob%40x.com')
  })

  it('lists a user’s roles', async () => {
    get.mockResolvedValue({ data: { roles: ['editors'] } })
    expect(await roleService.rolesForUser('alice')).toEqual(['editors'])
    expect(get).toHaveBeenCalledWith('/v1/users/alice/roles')
  })

  it('tolerates missing arrays', async () => {
    get.mockResolvedValue({ data: {} })
    expect(await roleService.listRoles()).toEqual([])
    expect(await roleService.usersInRole('r')).toEqual([])
  })
})

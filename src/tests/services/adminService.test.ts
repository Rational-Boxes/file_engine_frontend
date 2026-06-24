import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/services/apiClient', () => ({ default: { get, post } }))

import { adminService } from '@/services/adminService'

describe('adminService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps storage usage', async () => {
    get.mockResolvedValue({
      data: { total_space: 1000, used_space: 250, available_space: 750, usage_percentage: 25 },
    })
    expect(await adminService.storageUsage()).toEqual({
      totalSpace: 1000,
      usedSpace: 250,
      availableSpace: 750,
      usagePercentage: 25,
    })
    expect(get).toHaveBeenCalledWith('/v1/storage')
  })

  it('triggers a sync', async () => {
    post.mockResolvedValue({ data: {} })
    await adminService.triggerSync()
    expect(post).toHaveBeenCalledWith('/v1/sync')
  })
})

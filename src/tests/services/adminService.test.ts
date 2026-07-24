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

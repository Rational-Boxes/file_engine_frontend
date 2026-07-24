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

// Admin / ops over the bridge: storage usage and object-store sync. Both require
// admin on the bridge/core.
export interface StorageUsage {
  totalSpace: number
  usedSpace: number
  availableSpace: number
  usagePercentage: number
}

interface RawStorage {
  total_space: number
  used_space: number
  available_space: number
  usage_percentage: number
}

export const adminService = {
  async storageUsage(): Promise<StorageUsage> {
    const { data } = await apiClient.get<RawStorage>('/v1/storage')
    return {
      totalSpace: data?.total_space ?? 0,
      usedSpace: data?.used_space ?? 0,
      availableSpace: data?.available_space ?? 0,
      usagePercentage: data?.usage_percentage ?? 0,
    }
  },

  async triggerSync(): Promise<void> {
    await apiClient.post('/v1/sync')
  },
}

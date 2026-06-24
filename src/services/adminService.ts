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

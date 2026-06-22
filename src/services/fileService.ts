import apiClient from '@/services/apiClient'

export interface FileItem {
  uid: string
  name: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  isDirectory: boolean
}

export interface NodeInfo {
  uid: string
  name: string
  parent_uid: string
  type: string
  size: number
  owner: string
  version: string
}

interface DirEntry {
  uid: string
  name: string
  type: string
  size: number
  version_count: number
}

function toItem(e: DirEntry): FileItem {
  const type = (e.type as FileItem['type']) || 'file'
  return { uid: e.uid, name: e.name, type, size: e.size ?? 0, isDirectory: type === 'directory' }
}

// REST client for the bridge filesystem. The bridge is UID-native, so every
// operation addresses a node by its uid; throws an AxiosError on failure (the
// caller maps it to a user message via errorMessage()).
export const fileService = {
  async listDirectory(uid: string): Promise<FileItem[]> {
    const { data } = await apiClient.get<{ entries: DirEntry[] }>(`/v1/dirs/${uid}`)
    return (data.entries || []).map(toItem)
  },

  async makeDirectory(parentUid: string, name: string): Promise<string> {
    const { data } = await apiClient.post<{ uid: string }>(`/v1/dirs/${parentUid}`, { name })
    return data.uid
  },

  async touch(parentUid: string, name: string): Promise<string> {
    const { data } = await apiClient.post<{ uid: string }>(`/v1/dirs/${parentUid}/files`, { name })
    return data.uid
  },

  async removeFile(uid: string): Promise<void> {
    await apiClient.delete(`/v1/files/${uid}`)
  },

  async removeDirectory(uid: string): Promise<void> {
    await apiClient.delete(`/v1/dirs/${uid}`)
  },

  async rename(uid: string, newName: string): Promise<void> {
    await apiClient.post(`/v1/nodes/${uid}/rename`, { new_name: newName })
  },

  async stat(uid: string): Promise<NodeInfo> {
    const { data } = await apiClient.get<NodeInfo>(`/v1/nodes/${uid}`)
    return data
  },

  async downloadFile(uid: string): Promise<Blob> {
    const { data } = await apiClient.get(`/v1/files/${uid}/content`, { responseType: 'blob' })
    return data as Blob
  },
}

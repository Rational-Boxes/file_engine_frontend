import apiClient from '@/services/apiClient'

export interface FileItem {
  uid: string
  name: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  isDirectory: boolean
  // Hidden alternate-format renditions live as children of a file. They never
  // appear in normal listings; hasRenditions lets the UI offer to fetch them.
  renditionCount: number
  hasRenditions: boolean
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
  rendition_count?: number
  has_renditions?: boolean
}

function toItem(e: DirEntry): FileItem {
  const type = (e.type as FileItem['type']) || 'file'
  const renditionCount = e.rendition_count ?? 0
  return {
    uid: e.uid,
    name: e.name,
    type,
    size: e.size ?? 0,
    isDirectory: type === 'directory',
    renditionCount,
    hasRenditions: e.has_renditions ?? renditionCount > 0,
  }
}

// REST client for the bridge filesystem. The bridge is UID-native, so every
// operation addresses a node by its uid; throws an AxiosError on failure (the
// caller maps it to a user message via errorMessage()).
export const fileService = {
  async listDirectory(uid: string): Promise<FileItem[]> {
    const { data } = await apiClient.get<{ entries: DirEntry[] }>(`/v1/dirs/${uid}`)
    return (data.entries || []).map(toItem)
  },

  // List a file's hidden renditions (alternate-format children) on demand.
  async listRenditions(uid: string): Promise<FileItem[]> {
    const { data } = await apiClient.get<{ entries: DirEntry[] }>(`/v1/files/${uid}/renditions`)
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

  // --- metadata ---
  async getMetadata(uid: string): Promise<Record<string, string>> {
    const { data } = await apiClient.get<{ metadata: Record<string, string> }>(
      `/v1/nodes/${uid}/metadata`,
    )
    return data.metadata || {}
  },

  async setMetadata(uid: string, key: string, value: string): Promise<void> {
    await apiClient.put(`/v1/nodes/${uid}/metadata/${encodeURIComponent(key)}`, { value })
  },

  async deleteMetadata(uid: string, key: string): Promise<void> {
    await apiClient.delete(`/v1/nodes/${uid}/metadata/${encodeURIComponent(key)}`)
  },

  // --- permissions / ACL ---
  // Point-check a single permission for a principal (defaults to the requester).
  async checkPermission(
    uid: string,
    opts: { permission: string; user?: string; roles?: string[] },
  ): Promise<boolean> {
    const params: Record<string, string> = { permission: opts.permission }
    if (opts.user) params.user = opts.user
    if (opts.roles?.length) params.roles = opts.roles.join(',')
    const { data } = await apiClient.get<{ has_permission: boolean }>(
      `/v1/nodes/${uid}/permissions`,
      { params },
    )
    return !!data.has_permission
  },

  async grantPermission(
    uid: string,
    body: { principal: string; permission: string; effect?: 'allow' | 'deny' },
  ): Promise<void> {
    await apiClient.post(`/v1/nodes/${uid}/permissions`, body)
  },

  async revokePermission(
    uid: string,
    body: { principal: string; permission: string; effect?: 'allow' | 'deny' },
  ): Promise<void> {
    await apiClient.delete(`/v1/nodes/${uid}/permissions`, { data: body })
  },
}

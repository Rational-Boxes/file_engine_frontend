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
  // Soft-deleted. Only ever true in a with-deleted listing (showDeleted); the
  // UI marks these and offers Undelete.
  deleted: boolean
  // Provenance: creation/modification times (UNIX epoch seconds; 0 if unknown)
  // and the users behind them.
  createdAt: number
  modifiedAt: number
  owner: string
  createdBy: string
  modifiedBy: string
}

export interface NodeInfo {
  uid: string
  name: string
  parent_uid: string
  type: string
  size: number
  owner: string
  version: string
  // ctime/mtime (UNIX epoch seconds), core-derived from the version history.
  created_at?: number
  modified_at?: number
}

interface DirEntry {
  uid: string
  name: string
  type: string
  size: number
  version_count: number
  rendition_count?: number
  has_renditions?: boolean
  deleted?: boolean
  created_at?: number
  modified_at?: number
  owner?: string
  created_by?: string
  modified_by?: string
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
    deleted: e.deleted ?? false,
    createdAt: e.created_at ?? 0,
    modifiedAt: e.modified_at ?? 0,
    owner: e.owner ?? '',
    createdBy: e.created_by ?? '',
    modifiedBy: e.modified_by ?? '',
  }
}

// REST client for the bridge filesystem. The bridge is UID-native, so every
// operation addresses a node by its uid; throws an AxiosError on failure (the
// caller maps it to a user message via errorMessage()).
export const fileService = {
  // List a directory. With `deleted: true` the bridge returns soft-deleted
  // entries too (each carrying `deleted`), for the "show deleted" view — requires
  // the LIST_DELETED permission on the directory.
  async listDirectory(uid: string, opts?: { deleted?: boolean }): Promise<FileItem[]> {
    const { data } = await apiClient.get<{ entries: DirEntry[] }>(`/v1/dirs/${uid}`, {
      params: opts?.deleted ? { deleted: 'true' } : undefined,
    })
    return (data.entries || []).map(toItem)
  },

  // The uid of a non-directory child of `parentUid` named `name`, or null. Used
  // so re-uploading a file adds a new version to the existing one instead of
  // creating a duplicate (matching WebDAV's replace-on-path semantics).
  async findChildByName(parentUid: string, name: string): Promise<string | null> {
    const items = await this.listDirectory(parentUid)
    const match = items.find((i) => !i.isDirectory && i.name === name)
    return match ? match.uid : null
  },

  // List a file's hidden renditions (alternate-format children) on demand.
  async listRenditions(uid: string): Promise<FileItem[]> {
    const { data } = await apiClient.get<{ entries: DirEntry[] }>(`/v1/files/${uid}/renditions`)
    return (data.entries || []).map(toItem)
  },

  // Create a rendition (a hidden child of `sourceUid`) and write its bytes. A
  // rendition is just a child of a *file* UID (no special RPC — see
  // convert_search_ai/renditions.py), so this is touch(sourceUid, name) + PUT
  // content; the child inherits the source's ACL + cascade-delete. Used for the
  // client-produced `markup` PDF (Phase 7.1). Requires WRITE on the source file.
  // Returns the new child's uid.
  async createRendition(sourceUid: string, name: string, content: Blob): Promise<string> {
    const uid = await this.touch(sourceUid, name)
    await apiClient.put(`/v1/files/${uid}/content`, content, {
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    return uid
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

  // Soft-deletes the directory node; the server allows a non-empty directory and
  // hides its subtree by reachability, so no recursive flag is needed.
  async removeDirectory(uid: string): Promise<void> {
    await apiClient.delete(`/v1/dirs/${uid}`)
  },

  // Restore a soft-deleted file (requires the UNDELETE permission).
  async undeleteFile(uid: string): Promise<void> {
    await apiClient.post(`/v1/files/${uid}/undelete`)
  },

  async rename(uid: string, newName: string): Promise<void> {
    await apiClient.post(`/v1/nodes/${uid}/rename`, { new_name: newName })
  },

  // Move a node under a new parent directory (cut + paste). The backend enforces
  // the ACL (delete on the source, write on the destination).
  async move(uid: string, destinationParentUid: string): Promise<void> {
    await apiClient.post(`/v1/nodes/${uid}/move`, { destination_parent_uid: destinationParentUid })
  },

  // Copy a node (tree) under a new parent directory (copy + paste). The backend
  // enforces the ACL (read on the source, write on the destination).
  async copy(uid: string, destinationParentUid: string): Promise<void> {
    await apiClient.post(`/v1/nodes/${uid}/copy`, { destination_parent_uid: destinationParentUid })
  },

  async stat(uid: string): Promise<NodeInfo> {
    const { data } = await apiClient.get<NodeInfo>(`/v1/nodes/${uid}`)
    return data
  },

  async downloadFile(uid: string): Promise<Blob> {
    const { data } = await apiClient.get(`/v1/files/${uid}/content`, { responseType: 'blob' })
    return data as Blob
  },

  // --- versions ---
  async listVersions(uid: string): Promise<string[]> {
    const { data } = await apiClient.get<{ versions: string[] }>(`/v1/files/${uid}/versions`)
    return data.versions || []
  },

  async getVersion(uid: string, ts: string): Promise<Blob> {
    const { data } = await apiClient.get(`/v1/files/${uid}/versions/${encodeURIComponent(ts)}`, {
      responseType: 'blob',
    })
    return data as Blob
  },

  async restoreVersion(uid: string, ts: string): Promise<string> {
    const { data } = await apiClient.post<{ restored_version: string }>(`/v1/files/${uid}/restore`, {
      version_timestamp: ts,
    })
    return data.restored_version
  },

  async purgeVersions(uid: string, keepCount: number): Promise<void> {
    await apiClient.post(`/v1/files/${uid}/purge`, { keep_count: keepCount })
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

  // `recursive` cascades the grant/revoke to every descendant file and directory
  // (the bridge walks the subtree).
  async grantPermission(
    uid: string,
    body: { principal: string; permission: string; effect?: 'allow' | 'deny'; recursive?: boolean },
  ): Promise<void> {
    await apiClient.post(`/v1/nodes/${uid}/permissions`, body)
  },

  async revokePermission(
    uid: string,
    body: { principal: string; permission: string; effect?: 'allow' | 'deny'; recursive?: boolean },
  ): Promise<void> {
    await apiClient.delete(`/v1/nodes/${uid}/permissions`, { data: body })
  },
}

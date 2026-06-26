import apiClient from '@/services/apiClient'
import { fileService } from '@/services/fileService'

export const uploadService = {
  // Upload a file into a directory: stream the raw bytes to a node's content.
  // Replace-on-name — if a file with this name already exists in the target
  // directory, add a NEW VERSION to it (matching WebDAV's replace-on-path);
  // otherwise create the node (touch). Internal copy/move renames on collision
  // instead; an external add versions. `onProgress` receives 0..100.
  async upload(
    parentUid: string,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    const uid =
      (await fileService.findChildByName(parentUid, file.name)) ??
      (await fileService.touch(parentUid, file.name))
    await apiClient.put(`/v1/files/${uid}/content`, file, {
      headers: { 'Content-Type': 'application/octet-stream' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
    return uid
  },
}

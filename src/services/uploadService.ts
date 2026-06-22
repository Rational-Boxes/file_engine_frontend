import apiClient from '@/services/apiClient'
import { fileService } from '@/services/fileService'

export const uploadService = {
  // Upload a file into a directory: create the node (touch), then stream the raw
  // bytes to its content endpoint. `onProgress` receives 0..100.
  async upload(
    parentUid: string,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    const uid = await fileService.touch(parentUid, file.name)
    await apiClient.put(`/v1/files/${uid}/content`, file, {
      headers: { 'Content-Type': 'application/octet-stream' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
    return uid
  },
}

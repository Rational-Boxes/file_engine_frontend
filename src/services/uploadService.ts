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
import { fileService } from '@/services/fileService'
import { chunkedUpload, CHUNKED_THRESHOLD_BYTES } from '@/services/chunkedUpload'

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
    signal?: AbortSignal,
  ): Promise<string> {
    const uid =
      (await fileService.findChildByName(parentUid, file.name)) ??
      (await fileService.touch(parentUid, file.name))

    // Two shapes, one entry point. A single PUT is fewer moving parts and the
    // browser already streams it, so it stays the default — but it is all or
    // nothing, and for a large file that means a dropped connection costs the
    // whole transfer. Above the threshold the file goes up in parts that can be
    // retried and resumed individually. See chunkedUpload.
    if (file.size >= CHUNKED_THRESHOLD_BYTES) {
      await chunkedUpload.upload(uid, file, onProgress, signal)
      return uid
    }

    await apiClient.put(`/v1/files/${uid}/content`, file, {
      headers: { 'Content-Type': 'application/octet-stream' },
      signal,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
    return uid
  },
}

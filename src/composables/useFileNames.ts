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

import { ref } from 'vue'
import { fileService } from '@/services/fileService'

// Lazily resolve human file names for a set of file UIDs (citation chips, search
// results, …) so the UI can show names instead of raw UUIDs. Each UID is fetched
// at most once; failures are dropped so a later pass can retry.
export function useFileNames() {
  const names = ref<Record<string, string>>({})

  function resolve(uids: Array<string | undefined>) {
    for (const uid of uids) {
      if (uid && !(uid in names.value)) {
        names.value[uid] = '' // mark in-flight to dedupe concurrent lookups
        fileService
          .stat(uid)
          .then((info) => {
            names.value[uid] = info.name
          })
          .catch(() => {
            delete names.value[uid]
          })
      }
    }
  }

  return { names, resolve }
}

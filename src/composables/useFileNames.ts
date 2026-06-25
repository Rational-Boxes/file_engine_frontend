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

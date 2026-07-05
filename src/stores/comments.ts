import { defineStore } from 'pinia'

// Drives the global comment window (ThreadOverlay, mounted in App.vue) — the pure
// comment interface (§10g) that opens for ANY file regardless of preview/rendition
// availability (e.g. a 3D model that failed conversion). An overlay, not a route.
interface CommentsState {
  uid: string
  name: string
}

export const useCommentsStore = defineStore('comments', {
  state: (): CommentsState => ({ uid: '', name: '' }),
  getters: {
    isOpen: (s): boolean => !!s.uid,
  },
  actions: {
    open(uid: string, name = '') {
      if (!uid) return
      this.uid = uid
      this.name = name
    },
    close() {
      this.uid = ''
      this.name = ''
    },
  },
})

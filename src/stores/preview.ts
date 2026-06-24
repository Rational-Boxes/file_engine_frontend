import { defineStore } from 'pinia'

// Drives the global PDF preview overlay (PdfPreviewOverlay.vue, mounted in
// App.vue). Opening the preview is an overlay — NOT a route change — so the
// underlying Files browser / Chat / Search view keeps its state when the
// preview is closed.
interface PreviewState {
  uid: string
  name: string
}

export const usePreviewStore = defineStore('preview', {
  state: (): PreviewState => ({ uid: '', name: '' }),
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

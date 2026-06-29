import { defineStore } from 'pinia'

// Drives the global 3D model viewer overlay (ModelViewerOverlay.vue, mounted in
// App.vue). Like the document preview, opening the 3D viewer is an overlay — NOT
// a route change — so the underlying view keeps its state. `uid` is the SOURCE
// file's uid; the overlay resolves its `model` (.xkt) rendition on open.
interface Model3dState {
  uid: string
  name: string
}

export const useModel3dStore = defineStore('model3d', {
  state: (): Model3dState => ({ uid: '', name: '' }),
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

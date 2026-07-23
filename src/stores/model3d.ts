import { defineStore } from 'pinia'

// Navigation modes exposed by xeokit's CameraControl (Workstream A / §6).
export type NavMode = 'orbit' | 'firstPerson' | 'planView'
// The active transient measurement tool (Workstream C / §8). 'none' = no tool.
export type MeasureTool = 'none' | 'distance' | 'angle'
// Measurement display units (Workstream C / §8). Model units until §5.2 metadata
// lands; the user can switch. (BCF export is always metres — §17.)
export type MeasureUnits = 'mm' | 'm' | 'ft'

// Drives the global 3D model viewer overlay (ModelViewerOverlay.vue, mounted in
// App.vue). Like the document preview, opening the 3D viewer is an overlay — NOT
// a route change — so the underlying view keeps its state. `uid` is the SOURCE
// file's uid; the overlay resolves its `model` (.xkt) rendition on open.
//
// Beyond {uid,name}, the store now holds the running viewer's LIVE state (§5.3):
// a mounted Model3DViewer (the plugin host) syncs its nav mode, active tool,
// section planes, and selection here so the markup toolbar and the annotation
// layer can both reflect and drive the viewer without prop-drilling through the
// overlay. Empty/false defaults mean "no live viewer".
interface Model3dState {
  uid: string
  name: string
  // --- live viewer state (§5.3) ---
  ready: boolean // a Model3DViewer is mounted with a loaded model
  navMode: NavMode // current CameraControl nav mode
  activeTool: MeasureTool // active measurement tool (transient)
  measureUnits: MeasureUnits // measurement display units
  sectionPlaneIds: string[] // ids of the live SectionPlanesPlugin planes
  selection: string[] // currently highlighted/selected object ids
}

// The viewer-state slice, at rest. Extracted so open/close/teardown all reset to
// exactly the same shape.
function freshViewerState() {
  return {
    ready: false,
    navMode: 'orbit' as NavMode,
    activeTool: 'none' as MeasureTool,
    measureUnits: 'm' as MeasureUnits,
    sectionPlaneIds: [] as string[],
    selection: [] as string[],
  }
}

export const useModel3dStore = defineStore('model3d', {
  state: (): Model3dState => ({ uid: '', name: '', ...freshViewerState() }),
  getters: {
    isOpen: (s): boolean => !!s.uid,
    hasSection: (s): boolean => s.sectionPlaneIds.length > 0,
    isMeasuring: (s): boolean => s.activeTool !== 'none',
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
      this.resetViewerState()
    },
    // --- live viewer state, written by the mounted Model3DViewer ---
    setReady(v: boolean) {
      this.ready = v
    },
    setNavMode(mode: NavMode) {
      this.navMode = mode
    },
    setActiveTool(tool: MeasureTool) {
      this.activeTool = tool
    },
    setMeasureUnits(units: MeasureUnits) {
      this.measureUnits = units
    },
    setSectionPlanes(ids: string[]) {
      this.sectionPlaneIds = ids
    },
    setSelection(ids: string[]) {
      this.selection = ids
    },
    // Called when the viewer tears down (unmount or model swap) so stale live
    // state never lingers after the plugin host is gone.
    resetViewerState() {
      Object.assign(this, freshViewerState())
    },
  },
})

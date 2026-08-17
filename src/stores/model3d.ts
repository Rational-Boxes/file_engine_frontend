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
  // Explicit rendition override. Normally the overlay RESOLVES a file's own
  // `model`/`metamodel` renditions on open; a version comparison instead has a
  // specific pair of diff children to load, which are not the file's own model.
  // Empty strings keep the default resolve-on-open behaviour.
  xktUid: string
  metamodelUid: string
  // --- live viewer state (§5.3) ---
  ready: boolean // a Model3DViewer is mounted with a loaded model
  navMode: NavMode // current CameraControl nav mode
  activeTool: MeasureTool // active measurement tool (transient)
  measureUnits: MeasureUnits // measurement display units
  sectionPlaneIds: string[] // ids of the live SectionPlanesPlugin planes
  selection: string[] // currently highlighted/selected object ids
  seeThroughMode: boolean // Objects-tree clicks toggle X-ray (translucent) on a subtree
  xrayedIds: string[] // objects currently in see-through (X-ray) mode
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
    seeThroughMode: false,
    xrayedIds: [] as string[],
  }
}

export const useModel3dStore = defineStore('model3d', {
  state: (): Model3dState => ({
    uid: '', name: '', xktUid: '', metamodelUid: '', ...freshViewerState(),
  }),
  getters: {
    isOpen: (s): boolean => !!s.uid,
    hasSection: (s): boolean => s.sectionPlaneIds.length > 0,
    isMeasuring: (s): boolean => s.activeTool !== 'none',
  },
  actions: {
    // `renditions` pins the exact children to load instead of resolving the
    // file's own model — used by the version-comparison overlay, whose diff XKT
    // is a different child of the same source file.
    open(uid: string, name = '', renditions?: { xktUid?: string; metamodelUid?: string }) {
      if (!uid) return
      this.uid = uid
      this.name = name
      this.xktUid = renditions?.xktUid || ''
      this.metamodelUid = renditions?.metamodelUid || ''
    },
    close() {
      this.uid = ''
      this.name = ''
      this.xktUid = ''
      this.metamodelUid = ''
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
    setSeeThroughMode(v: boolean) {
      this.seeThroughMode = v
    },
    setXRayed(ids: string[]) {
      this.xrayedIds = ids
    },
    // Called when the viewer tears down (unmount or model swap) so stale live
    // state never lingers after the plugin host is gone.
    resetViewerState() {
      Object.assign(this, freshViewerState())
    },
  },
})

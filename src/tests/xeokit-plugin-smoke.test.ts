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

import { describe, it, expect, beforeAll, vi } from 'vitest'

// Smoke test for the xeokit SDK upgrade (Phase 0 / §5.1 of
// XEOKIT_UPGRADE_MARKUP_BCF_PLAN.md). Imports the REAL installed
// @xeokit/xeokit-sdk (not the vi.mock the viewer test uses) and asserts every
// plugin/class the upgrade + markup + BCF plan builds on is exported as a
// constructor by the pinned version (2.6.112). This is the guard the plan asks
// for: a version bump that drops or renames a plugin (the next-gen scoped
// @xeokit/* SDK has weaker plugin parity) fails here instead of at runtime.
//
// Full instantiation needs a real WebGL Viewer, which jsdom can't provide; that
// is covered where the viewer refactor wires each plugin under a mocked Viewer
// (§5.3). Here we verify availability — exactly what a version bump can break.
//
// Availability turned out not to be enough. AnnotationsPlugin is declared
// `constructor(viewer, cfg)` with no default and reads `cfg.labelHTML` on its
// first line, so the viewer's `new Ctor(viewer)` threw at runtime — the export
// was present and constructable, and the plugin was silently absent anyway,
// taking every 3D comment marker with it. The viewer test mocks the SDK, so
// nothing exercised the real constructor contract.
//
// The second block below closes that: it makes each plugin THE WAY THE VIEWER
// DOES. No WebGL is needed, because argument handling happens before any GL
// work; a stub viewer satisfies the Plugin base class.

// (export name, why the plan needs it)
const REQUIRED: Array<[string, string]> = [
  ['Viewer', 'core — the viewer host'],
  ['XKTLoaderPlugin', 'core — loads the .xkt model'],
  ['TreeViewPlugin', 'core — object tree'],
  ['NavCubePlugin', 'Workstream A — nav cube (still disabled pending upstream #2016)'],
  ['StoreyViewsPlugin', 'Workstream A — IFC storey plan views'],
  ['SectionPlanesPlugin', 'Workstream B — cut-away / clipping planes'],
  ['DistanceMeasurementsPlugin', 'Workstream C — distance measurement'],
  ['AngleMeasurementsPlugin', 'Workstream C — angle measurement'],
  ['AnnotationsPlugin', 'Workstream D — annotation markers'],
  ['BCFViewpointsPlugin', 'Workstreams E/F — BCF viewpoint get/set'],
]

let xeokit: Record<string, unknown>

beforeAll(async () => {
  // xeokit's bundle probes for a WebGL context at import time; jsdom's
  // getContext is unimplemented and would log noisy (harmless) errors. Stub it
  // to return null so the probe resolves quietly, then import the real SDK.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
  xeokit = (await import('@xeokit/xeokit-sdk')) as Record<string, unknown>
})

describe('xeokit SDK plugin availability (pinned 2.6.112)', () => {
  it.each(REQUIRED)('exports %s as a constructor (%s)', (name) => {
    expect(typeof xeokit[name], `${name} must be a constructable export`).toBe('function')
  })
})


// Constructed exactly as Model3DViewer.makePlugins does — same argument shape.
// A plugin whose constructor cannot survive that call is unavailable at runtime
// no matter how correctly it is exported.
const CONSTRUCTED: Array<[string, Record<string, unknown>]> = [
  ['SectionPlanesPlugin', {}],
  ['DistanceMeasurementsPlugin', {}],
  ['AngleMeasurementsPlugin', {}],
  ['AnnotationsPlugin', { surfaceOffset: 0.3 }],
  ['BCFViewpointsPlugin', {}],
]

// The Plugin base class only records the viewer and registers itself; the parts
// that need WebGL are not touched during construction.
function stubViewer() {
  const scene = {
    on: () => 0,
    off: () => undefined,
    canvas: { canvas: document.createElement('canvas') },
    camera: { on: () => 0, eye: [0, 0, 0], look: [0, 0, 0], up: [0, 1, 0] },
    objects: {},
    input: { on: () => 0, off: () => undefined },
  }
  return {
    scene,
    camera: scene.camera,
    metaScene: { metaObjects: {} },
    addPlugin: () => undefined,
    removePlugin: () => undefined,
    on: () => 0,
    off: () => undefined,
    localeService: { on: () => 0, translate: (s: string) => s },
  }
}

describe('the plugins can actually be constructed the way the viewer builds them', () => {
  it.each(CONSTRUCTED)('%s survives new Ctor(viewer, cfg)', (name, cfg) => {
    const Ctor = xeokit[name] as new (v: unknown, c: unknown) => unknown
    // If a plugin needs more of the viewer than the stub offers, that is a
    // different failure — it would show up as a missing property, not as the
    // undefined-cfg dereference this guards.
    expect(() => new Ctor(stubViewer(), cfg)).not.toThrow()
  })

  it('AnnotationsPlugin rejects the no-config call the viewer used to make', () => {
    // Pins the actual defect: if a future SDK defaults cfg, this test failing is
    // the signal that the workaround is no longer needed — not a regression.
    const Ctor = xeokit.AnnotationsPlugin as new (v: unknown, c?: unknown) => unknown
    expect(() => new (Ctor as new (v: unknown) => unknown)(stubViewer())).toThrow()
  })
})

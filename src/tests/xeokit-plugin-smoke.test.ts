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

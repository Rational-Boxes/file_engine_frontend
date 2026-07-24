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

import { describe, it, expect } from 'vitest'
import { modelFormat, is3DModel, modelIcon } from '@/utils/modelFormat'

describe('modelFormat', () => {
  it('maps IFC family', () => {
    expect(modelFormat('tower.ifc')).toBe('3d-ifc')
    expect(modelFormat('tower.IFC')).toBe('3d-ifc')
    expect(modelFormat('m.ifcxml')).toBe('3d-ifc')
    expect(modelFormat('m.ifczip')).toBe('3d-ifc')
  })

  it('maps glTF/GLB', () => {
    expect(modelFormat('scene.gltf')).toBe('3d-gltf')
    expect(modelFormat('scene.glb')).toBe('3d-gltf')
  })

  it('maps CityJSON (only the .city.json double extension)', () => {
    expect(modelFormat('city.city.json')).toBe('3d-cityjson')
    expect(modelFormat('data.json')).toBeNull() // plain JSON is not assumed 3D
  })

  it('maps point clouds and meshes', () => {
    expect(modelFormat('cloud.las')).toBe('3d-pointcloud')
    expect(modelFormat('cloud.laz')).toBe('3d-pointcloud')
    expect(modelFormat('part.stl')).toBe('3d-mesh')
    expect(modelFormat('part.ply')).toBe('3d-mesh')
    expect(modelFormat('mesh.obj')).toBe('3d-mesh')
    expect(modelFormat('world.wrl')).toBe('3d-mesh')
    expect(modelFormat('world.vrml')).toBe('3d-mesh')
  })

  it('maps CAD solids (STEP/IGES/BREP, via the OpenCASCADE backend)', () => {
    expect(modelFormat('part.step')).toBe('3d-cad')
    expect(modelFormat('part.stp')).toBe('3d-cad')
    expect(modelFormat('part.STP')).toBe('3d-cad')
    expect(modelFormat('part.iges')).toBe('3d-cad')
    expect(modelFormat('part.igs')).toBe('3d-cad')
    expect(modelFormat('shape.brep')).toBe('3d-cad')
  })

  it('returns null for non-3D and missing extensions', () => {
    expect(modelFormat('report.pdf')).toBeNull()
    expect(modelFormat('photo.png')).toBeNull()
    expect(modelFormat('noext')).toBeNull()
    expect(modelFormat('')).toBeNull()
  })

  it('is3DModel reflects modelFormat', () => {
    expect(is3DModel('a.glb')).toBe(true)
    expect(is3DModel('a.txt')).toBe(false)
  })

  it('modelIcon returns a glyph for 3D formats, null otherwise', () => {
    expect(modelIcon('tower.ifc')).toBe('🏗️')
    expect(modelIcon('city.city.json')).toBe('🏙️')
    expect(modelIcon('cloud.las')).toBe('☁️')
    expect(modelIcon('m.glb')).toBe('🧊')
    expect(modelIcon('part.step')).toBe('⚙️')
    expect(modelIcon('part.iges')).toBe('⚙️')
    expect(modelIcon('mesh.obj')).toBe('🧊')
    expect(modelIcon('report.pdf')).toBeNull()
  })
})

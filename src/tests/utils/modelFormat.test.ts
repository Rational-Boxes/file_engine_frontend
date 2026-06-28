import { describe, it, expect } from 'vitest'
import { modelFormat, is3DModel } from '@/utils/modelFormat'

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
})

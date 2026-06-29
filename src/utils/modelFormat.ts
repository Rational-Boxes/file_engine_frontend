// Classify a file as a 3D/BIM model by its name extension, for picking a
// format-specific icon and deciding whether to offer the 3D viewer. The bridge
// does not return a MIME type for listing entries, so we key off the extension
// (mirrors convert_search_ai's MIME detection on the backend). The definitive
// signal that a model is *viewable* is the presence of a `model` (.xkt)
// rendition; this is the cheap, list-time hint.

export type ModelFormat =
  | '3d-ifc'
  | '3d-gltf'
  | '3d-cityjson'
  | '3d-pointcloud'
  | '3d-mesh'

const EXT: Record<string, ModelFormat> = {
  ifc: '3d-ifc',
  ifcxml: '3d-ifc',
  ifczip: '3d-ifc',
  gltf: '3d-gltf',
  glb: '3d-gltf',
  las: '3d-pointcloud',
  laz: '3d-pointcloud',
  stl: '3d-mesh',
  ply: '3d-mesh',
}

export function modelFormat(name: string): ModelFormat | null {
  const lower = (name || '').toLowerCase()
  // CityJSON only via the unambiguous double extension (plain .json is not 3D).
  if (lower.endsWith('.city.json')) return '3d-cityjson'
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return null
  return EXT[lower.slice(dot + 1)] ?? null
}

export function is3DModel(name: string): boolean {
  return modelFormat(name) !== null
}

// Format-specific glyphs for 3D/BIM files (which carry no raster thumbnail).
const ICON: Record<ModelFormat, string> = {
  '3d-ifc': '🏗️',
  '3d-gltf': '🧊',
  '3d-cityjson': '🏙️',
  '3d-pointcloud': '☁️',
  '3d-mesh': '🧊',
}

// The icon for a 3D model file, or null if the name isn't a known 3D format.
export function modelIcon(name: string): string | null {
  const fmt = modelFormat(name)
  return fmt ? ICON[fmt] : null
}

import { fileService, type FileItem } from '@/services/fileService'

// Renditions are hidden children of a source file, named "<version>-<fmt>.<ext>"
// by convert_search_ai (see its renditions.py). This module turns that flat list
// of children into a typed set the UI can use, and exposes auth'd content URLs.
//
// fmt vocabulary produced by the default plugins:
//   thumbnail  icon-sized first-page image (PNG)
//   preview    larger first-page image (PNG)        ← shown on open
//   pdf        inline document PDF (Office docs)     ← fetched only on demand
//   poster     video poster frame (PNG)
export type RenditionFmt = 'thumbnail' | 'preview' | 'pdf' | 'poster'

const KNOWN: readonly RenditionFmt[] = ['thumbnail', 'preview', 'pdf', 'poster']

export interface RenditionRef {
  uid: string
  name: string
  fmt: RenditionFmt
  ext: string
  version: string
}

export type RenditionSet = Partial<Record<RenditionFmt, RenditionRef>>

// Parse "<version>-<fmt>.<ext>". The version may itself contain '.', '_' and '-'
// (it's a sanitized timestamp), so split off the extension, then the trailing
// "-<fmt>" where fmt is from the known vocabulary. Returns null for non-rendition
// names so unrelated children are ignored.
export function parseRenditionName(
  name: string,
): { version: string; fmt: RenditionFmt; ext: string } | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = name.slice(dot + 1)
  const stem = name.slice(0, dot) // "<version>-<fmt>"
  const dash = stem.lastIndexOf('-')
  if (dash <= 0) return null
  const fmt = stem.slice(dash + 1) as RenditionFmt
  if (!KNOWN.includes(fmt)) return null
  return { version: stem.slice(0, dash), fmt, ext }
}

// Reduce a file's rendition children to one entry per fmt, latest source version
// winning (versions are sortable timestamp ids).
export function toRenditionSet(children: Array<Pick<FileItem, 'uid' | 'name'>>): RenditionSet {
  const set: RenditionSet = {}
  for (const c of children) {
    const p = parseRenditionName(c.name)
    if (!p) continue
    const prev = set[p.fmt]
    if (!prev || p.version > prev.version) {
      set[p.fmt] = { uid: c.uid, name: c.name, fmt: p.fmt, ext: p.ext, version: p.version }
    }
  }
  return set
}

// Fetch a file's renditions and return them as a typed set.
export async function loadRenditionSet(fileUid: string): Promise<RenditionSet> {
  const children = await fileService.listRenditions(fileUid)
  return toRenditionSet(children)
}

// Download a rendition's bytes (auth'd) and wrap them in an object URL suitable
// for <img src> / <embed src>. The caller MUST revokeRenditionUrl() it when done
// to avoid leaking blob URLs.
// `mime` re-types the blob (the bridge serves content as application/octet-stream,
// which makes a blob: URL download instead of render inline — e.g. a PDF in an
// <iframe>, or a PNG in an <img>). Pass the rendition's real type to force inline.
export async function renditionObjectUrl(uid: string, mime?: string): Promise<string> {
  const blob = await fileService.downloadFile(uid)
  const typed = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob
  return URL.createObjectURL(typed)
}

export function revokeRenditionUrl(url: string): void {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
}

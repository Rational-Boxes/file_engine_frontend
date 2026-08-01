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
//   model      xeokit XKT 3D/BIM model               ← loaded by the 3D viewer
//   metamodel  xeokit MetaModel JSON (objects/tree)  ← loaded alongside the model
//   chatlog    chat provenance log (HTML) for an AI-generated report ← "view log"
//   markup     a browser-annotated copy of a PDF (Phase 7.1) attached to a comment.
//              UNLIKE the pipeline-produced fmts above, a markup is client-produced
//              and keyed to the comment (user + timestamp) rather than a source
//              version — many can coexist. It is referenced directly by uid from the
//              comment's `markup` pointer, so it is never surfaced through the
//              one-per-fmt RenditionSet (toRenditionSet keeps only the latest). It is
//              deliberately NOT in convert_search_ai's _KNOWN_FMTS, so the conversion
//              pipeline's version-pruner leaves markups alone across re-conversions.
export type RenditionFmt = 'thumbnail' | 'preview' | 'pdf' | 'poster' | 'model' | 'metamodel' | 'chatlog' | 'markup'

const KNOWN: readonly RenditionFmt[] = ['thumbnail', 'preview', 'pdf', 'poster', 'model', 'metamodel', 'chatlog', 'markup']

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

const IMAGE_EXTS: readonly string[] = ['png', 'webp', 'jpg', 'jpeg', 'gif']
const isImageRef = (r?: RenditionRef): r is RenditionRef =>
  !!r && IMAGE_EXTS.includes(r.ext.toLowerCase())

// The icon-sized still image for a file tile: the `thumbnail`, or the video
// `poster` frame when there is no thumbnail.
export function thumbnailImage(set: RenditionSet): RenditionRef | undefined {
  return isImageRef(set.thumbnail) ? set.thumbnail : set.poster
}

// The larger still image for the preview pane: the `preview` image (documents /
// images), or the video `poster` frame. A video's `preview` rendition is an MP4
// clip — NOT an image — so it must never be used as the still; fall back to the
// poster (and finally the thumbnail).
export function previewImage(set: RenditionSet): RenditionRef | undefined {
  if (isImageRef(set.preview)) return set.preview
  return set.poster ?? (isImageRef(set.thumbnail) ? set.thumbnail : undefined)
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

// The filename for a client-produced `markup` rendition (Phase 7.1). Keyed to the
// annotating user + capture time (NOT a source version), so several markups can
// coexist under one PDF. Mirrors the "<version>-<fmt>.<ext>" shape parseRenditionName
// expects, but the "version" slot carries "<user>_<timestamp>". Unsafe characters are
// collapsed to '_' (including '-', so the trailing "-markup" delimiter is never
// ambiguous). The comment stores the resulting child's uid + this name.
export function markupRenditionName(user: string, at: Date = new Date()): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._]/g, '_') || '0'
  const stamp = safe(at.toISOString()) // e.g. 2026_08_01T12_00_00.000Z
  const who = safe(user || 'anon')
  return `${who}_${stamp}-markup.pdf`
}

// Create a `markup` rendition: a hidden child of the source PDF holding the
// annotated bytes. Renditions are just children of a file UID (no special RPC — see
// convert_search_ai/renditions.py), so touch(sourceUid, name) + PUT content is all
// it takes; the child inherits the source's ACL + cascade delete. Returns the new
// child's uid. Requires WRITE on the source file (enforced by the core on touch).
export async function createMarkupRendition(
  sourceUid: string,
  user: string,
  bytes: Uint8Array | Blob,
): Promise<{ uid: string; name: string }> {
  const name = markupRenditionName(user)
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'application/pdf' })
  const uid = await fileService.createRendition(sourceUid, name, blob)
  return { uid, name }
}

// The 3D model rendition (xeokit XKT), if present. Not an image, so it is never
// surfaced by thumbnailImage()/previewImage().
export function modelRendition(set: RenditionSet): RenditionRef | undefined {
  return set.model
}

// The xeokit MetaModel JSON sidecar (objects/tree/props), when the pipeline emitted
// one (IFC today; more formats as the §5.2 metamodel track lands). Loaded into the
// viewer via XKTLoaderPlugin.load({ xkt, metaModelData }).
export function metamodelRendition(set: RenditionSet): RenditionRef | undefined {
  return set.metamodel
}

// Download a rendition's bytes as an ArrayBuffer — what the xeokit XKTLoaderPlugin
// consumes (it wants the raw buffer, not an object URL).
export async function renditionArrayBuffer(uid: string): Promise<ArrayBuffer> {
  const blob = await fileService.downloadFile(uid)
  return blob.arrayBuffer()
}

// Download a rendition's bytes as text — used for the chat-provenance log, whose
// HTML is injected into a shadow root (style isolation; injected <script> never
// runs) rather than an <iframe>.
export async function renditionText(uid: string): Promise<string> {
  const blob = await fileService.downloadFile(uid)
  return blob.text()
}

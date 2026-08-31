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

// Will the preview surface have anything to show for this file?
//
// The answer depends on WHICH rendition exists, not merely whether any does:
//
//   PDF     the file is a .pdf, or a `pdf` rendition was generated from it
//   3D      a `model` rendition (the xeokit XKT) exists — this is what makes a
//           converted .step or .ifc previewable, and an unconverted one not
//   video   the `preview` rendition is a playable clip (webm/mp4/…); the
//           `poster` beside it is only the still frame
//   image   a format the browser renders inline, or a still `preview` image
//
// "Has renditions" alone is too loose: a file whose only child is a `metamodel`
// sidecar or a `markup` overlay has nothing to display, and would send a double
// click to an empty frame.

import { VIDEO_EXTS, type RenditionSet } from '@/services/renditions'
import { is3DModel } from './modelFormat'

// Image formats a browser renders inline. Not the same list as the renditions
// module's IMAGE_EXTS, which describes what the PIPELINE emits; this is what a
// user may have uploaded and expect to just open.
//
// Deliberately excludes tiff, psd and heic: no mainstream browser displays them
// inline, so they need a generated preview like any other document.
//
// NOTE for anyone adding a source-image fallback later: svg is inline-renderable
// and is also an active document. Today nothing renders source bytes — the
// preview surface only ever shows renditions — so listing it here promises a
// page, not an injection. Rendering an untrusted .svg directly would need
// sandboxing.
const INLINE_IMAGE_EXTS: readonly string[] = [
  'apng', 'avif', 'bmp', 'gif', 'ico', 'cur', 'jfif', 'jpeg', 'jpg', 'pjp',
  'pjpeg', 'png', 'svg', 'webp',
]

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

// A .pdf is its own inline document — the viewer reads the file itself, so it
// needs no rendition (DocumentPreview.isNativePdf).
export const isNativePdfName = (name: string): boolean => extensionOf(name) === 'pdf'

export const isInlineImageName = (name: string): boolean =>
  INLINE_IMAGE_EXTS.includes(extensionOf(name))

// The subset of a listing row this decision needs. Structural rather than the
// full FileItem, so the rule can be tested without building a service type.
export interface PreviewCandidate {
  name: string
  isDirectory: boolean
  deleted?: boolean
  hasRenditions?: boolean
}

// What can be settled from the row alone, with no request:
//   'yes'   the file previews on its own — a PDF or an inline image
//   'no'    nothing has been generated, and it is not self-previewing
//   'ask'   it depends on which renditions exist; fetch the set
export type PreviewVerdict = 'yes' | 'no' | 'ask'

export function previewVerdictFromRow(item: PreviewCandidate): PreviewVerdict {
  // A folder has no preview surface, and a soft-deleted item cannot be opened
  // at all until it is restored.
  if (item.isDirectory || item.deleted) return 'no'
  if (isNativePdfName(item.name) || isInlineImageName(item.name)) return 'yes'
  if (!item.hasRenditions) return 'no'
  return 'ask'
}

// The full rule, once the rendition set is known.
export function canPreviewWithRenditions(name: string, set: RenditionSet): boolean {
  if (isNativePdfName(name) || isInlineImageName(name)) return true
  if (set.pdf) return true            // office documents convert to a PDF
  if (set.model) return true          // 3D: the XKT the model viewer loads
  // Both questions are about the SAME rendition, so they are asked together.
  // Asking them as two separate `if (guard(set.preview)) return` statements does
  // not type-check: isVideoRef is a type predicate, so the negative branch
  // narrows set.preview to undefined and the second test sees `never`.
  const still = set.preview
  if (still) {
    // A playable clip — the poster beside it is only the still frame.
    if (VIDEO_EXTS.includes(still.ext.toLowerCase())) return true
    // A still counts only if the browser can actually display it. That a preview
    // rendition EXISTS is not a promise that it is a browser-known image format;
    // the pipeline may have emitted something for its own purposes.
    if (isInlineImageName(still.name)) return true
  }
  return false
}

// Whether the 3D viewer specifically can take this file. A recognised extension
// is not enough — the viewer loads the converted geometry, not the source.
export function canView3DModel(item: PreviewCandidate): boolean {
  return !item.isDirectory && !!item.hasRenditions && is3DModel(item.name)
}

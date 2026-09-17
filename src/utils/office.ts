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

// Editable office document detection for the ONLYOFFICE in-browser editor
// (Phase 1.7). Mirrors the backend's editable set (convert_search_ai/onlyoffice.py)
// so the SPA only offers "Edit" for documents the Document Server can actually open.

// HTML is edited graphically in the word editor and saved back as HTML — so stored
// .html files (e.g. AI-generated reports) can be edited WYSIWYG.
const WORD = ['doc', 'docx', 'docm', 'dot', 'dotx', 'odt', 'ott', 'rtf', 'txt', 'html', 'htm']
const CELL = ['xls', 'xlsx', 'xlsm', 'xlt', 'xltx', 'ods', 'ots', 'csv']
const SLIDE = ['ppt', 'pptx', 'pptm', 'pot', 'potx', 'odp', 'otp']

const EDITABLE = new Set([...WORD, ...CELL, ...SLIDE])

export function fileExtension(name: string): string {
  const n = name || ''
  const dot = n.lastIndexOf('.')
  return dot > 0 ? n.slice(dot + 1).toLowerCase() : ''
}

// True when `name` is an office document ONLYOFFICE can edit.
export function isEditableOffice(name: string): boolean {
  return EDITABLE.has(fileExtension(name))
}

// The ONLYOFFICE editor family for a name (word/cell/slide), or '' if not editable.
export function officeDocumentType(name: string): '' | 'word' | 'cell' | 'slide' {
  const ext = fileExtension(name)
  if (WORD.includes(ext)) return 'word'
  if (CELL.includes(ext)) return 'cell'
  if (SLIDE.includes(ext)) return 'slide'
  return ''
}

// ---------------------------------------------------------------------------
// Creating a new, empty document in place ("New document" in the file browser).
//
// There is no template and no upload: a zero-byte node with the right EXTENSION
// is all the Document Server needs — it opens one as a blank document of that
// type and writes real content on the first save, through the ordinary
// callback → new-version path. So creating a document is `touch` plus opening
// the editor, which is why this feature adds no service call of its own.

export interface NewDocumentType {
  /** Extension, without the dot — this is what makes the file what it is. */
  ext: string
  /** Menu entry, e.g. "Word document". */
  label: string
  /** Default base name offered in the name prompt (no extension). */
  defaultName: string
}

export const NEW_DOCUMENT_TYPES: NewDocumentType[] = [
  { ext: 'docx', label: 'Word document', defaultName: 'Document' },
  { ext: 'xlsx', label: 'Spreadsheet', defaultName: 'Spreadsheet' },
  { ext: 'pptx', label: 'Presentation', defaultName: 'Presentation' },
]

// The types this DEPLOYMENT can actually open, given the extension list the
// capabilities endpoint reports. An empty/absent list means "could not ask" —
// which capabilitiesService deliberately treats as available rather than off —
// so offer everything rather than silently withdrawing the feature.
export function creatableDocumentTypes(extensions?: string[]): NewDocumentType[] {
  if (!extensions || extensions.length === 0) return NEW_DOCUMENT_TYPES
  const have = new Set(extensions.map((e) => e.replace(/^\./, '').toLowerCase()))
  return NEW_DOCUMENT_TYPES.filter((t) => have.has(t.ext))
}

// A name not already used in `taken`, by appending " (2)", " (3)", … before the
// extension. Creating a document must never collide with an existing file: an
// upload deliberately versions onto a same-named file (WebDAV replace-on-path
// semantics), and doing that here would bury someone else's document under a
// blank first page instead of making a new one.
export function uniqueDocumentName(taken: Iterable<string>, base: string, ext: string): string {
  const used = new Set(Array.from(taken, (n) => n.toLowerCase()))
  const stem = (base || '').trim() || 'Document'
  const candidate = (n: number) => (n === 1 ? `${stem}.${ext}` : `${stem} (${n}).${ext}`)
  let n = 1
  while (used.has(candidate(n).toLowerCase())) n++
  return candidate(n)
}

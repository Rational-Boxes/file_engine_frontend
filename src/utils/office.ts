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

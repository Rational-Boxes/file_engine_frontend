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
import { fileExtension, isEditableOffice, officeDocumentType, creatableDocumentTypes, uniqueDocumentName } from '@/utils/office'

describe('fileExtension', () => {
  it('extracts the lowercased extension', () => {
    expect(fileExtension('Report.DOCX')).toBe('docx')
    expect(fileExtension('a.b.pptx')).toBe('pptx')
    expect(fileExtension('noext')).toBe('')
    expect(fileExtension('.env')).toBe('') // leading dot is not an extension
  })
})

describe('isEditableOffice', () => {
  it('is true for word/cell/slide formats (incl. HTML)', () => {
    for (const n of ['report.docx', 'notes.odt', 'budget.xlsx', 'data.csv', 'deck.pptx', 'x.odp',
                     'summary.html', 'PAGE.HTM'])
      expect(isEditableOffice(n)).toBe(true)
  })
  it('is false for non-office files', () => {
    for (const n of ['photo.png', 'model.ifc', 'a.pdf', 'archive.zip', 'noext'])
      expect(isEditableOffice(n)).toBe(false)
  })
})

describe('officeDocumentType', () => {
  it('maps to the ONLYOFFICE editor family', () => {
    expect(officeDocumentType('a.docx')).toBe('word')
    expect(officeDocumentType('a.html')).toBe('word') // HTML edits in the word editor
    expect(officeDocumentType('a.xlsx')).toBe('cell')
    expect(officeDocumentType('a.pptx')).toBe('slide')
    expect(officeDocumentType('a.png')).toBe('')
  })
})

describe('creatableDocumentTypes', () => {
  it('offers everything when the deployment did not say', () => {
    // Unknown is not off — an older service with no capabilities endpoint must
    // not silently withdraw the feature.
    expect(creatableDocumentTypes().map((t) => t.ext)).toEqual(['docx', 'xlsx', 'pptx', 'txt'])
    expect(creatableDocumentTypes([]).map((t) => t.ext)).toEqual(['docx', 'xlsx', 'pptx', 'txt'])
  })

  it('offers only what the Document Server reports it opens', () => {
    expect(creatableDocumentTypes(['docx', 'pdf']).map((t) => t.ext)).toEqual(['docx', 'txt'])
  })

  it('tolerates leading dots and case in the reported list', () => {
    expect(creatableDocumentTypes(['.DOCX', '.Xlsx']).map((t) => t.ext)).toEqual(['docx', 'xlsx', 'txt'])
  })
})

describe('uniqueDocumentName', () => {
  it('uses the plain name when nothing collides', () => {
    expect(uniqueDocumentName([], 'Document', 'docx')).toBe('Document.docx')
  })

  it('suffixes before the extension on a collision', () => {
    expect(uniqueDocumentName(['Document.docx'], 'Document', 'docx')).toBe('Document (2).docx')
    expect(uniqueDocumentName(['Document.docx', 'Document (2).docx'], 'Document', 'docx')).toBe(
      'Document (3).docx',
    )
  })

  it('compares case-insensitively, as the store does', () => {
    expect(uniqueDocumentName(['document.DOCX'], 'Document', 'docx')).toBe('Document (2).docx')
  })

  it('does not collide across different extensions', () => {
    expect(uniqueDocumentName(['Budget.xlsx'], 'Budget', 'docx')).toBe('Budget.docx')
  })

  it('trims, and falls back when the user gives an empty name', () => {
    expect(uniqueDocumentName([], '  Notes  ', 'docx')).toBe('Notes.docx')
    expect(uniqueDocumentName([], '   ', 'docx')).toBe('Document.docx')
  })
})

describe('creatableDocumentTypes — the text entry', () => {
  it('survives a Document Server that opens nothing at all', () => {
    // A text file opens in the SPA's own editor, so the docserver's list has no
    // bearing on it. A deployment without ONLYOFFICE still offers one.
    expect(creatableDocumentTypes(['pdf']).map((t) => t.ext)).toContain('txt')
  })

  it('is the only type routed to the text editor', () => {
    const text = creatableDocumentTypes().filter((t) => t.editor === 'text')
    expect(text.map((t) => t.ext)).toEqual(['txt'])
  })
})

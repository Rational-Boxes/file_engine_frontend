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
import { fileExtension, isEditableOffice, officeDocumentType } from '@/utils/office'

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

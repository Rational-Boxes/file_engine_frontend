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

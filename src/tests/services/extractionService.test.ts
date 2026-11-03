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
import {
  entryRows, entryTitle, findMarkupPdf, formatValue, markupPdfName, marksFromNotes,
} from '@/services/extractionService'

describe('extracted rows', () => {
  it('formats values for reading', () => {
    expect(formatValue({ found: true, value: true, unit: null, evidence: null })).toBe('Yes')
    expect(formatValue({ found: true, value: ['a', 'b'], unit: null, evidence: null })).toBe('a, b')
    expect(formatValue({ found: true, value: 12, unit: 'kg', evidence: null })).toBe('12 kg')
    expect(formatValue({ found: false, value: 'x', unit: null, evidence: null })).toBe('')
  })

  it('follows a raw schema when there is no prompt set', () => {
    const rows = entryRows({
      entry: 'k', prompt_set: null,
      schema: { properties: { b: { description: 'Bee' }, a: {} } },
      data: { a: { found: true, value: 'A', unit: null, evidence: { quote: 'q', offset: 0 } } },
    })
    expect(rows.map((r) => [r.name, r.found, r.description])).toEqual([['b', false, 'Bee'], ['a', true, '']])
    expect(rows[1].quote).toBe('q')
    expect(rows[1].mark).toBeNull()
  })

  it('titles an entry by its prompt set', () => {
    expect(entryTitle({ entry: 'k', prompt_set: { id: 'ps', revision: 3, name: 'Doors' }, data: {} })).toBe('Doors r3')
    expect(entryTitle({ entry: 'k', prompt_set: null, data: {} })).toBe('Extracted values')
  })

  it('names the marked-up PDF as csai writes it', () => {
    const ps = { entry: 'abcdef0123456789', prompt_set: { id: 'ps_Door-Set', revision: 1 }, data: {} }
    const raw = { entry: 'ABCDEF0123456789', prompt_set: null, data: {} }
    expect(markupPdfName(ps, '20261103T100000.123-1')).toBe('20261103T100000.123-1-extractpdf_doorset.pdf')
    expect(markupPdfName(raw, 'v 1')).toBe('v_1-extractpdf_sabcdef012345.pdf')
    const kids = [{ uid: 'a', name: 'v1-extract.json' }, { uid: 'b', name: 'v1-extractpdf_doorset.pdf' },
      { uid: 'c', name: 'v0-extractpdf_doorset.pdf' }]
    expect(findMarkupPdf(ps, 'v1', kids)?.uid).toBe('b')
    expect(findMarkupPdf(ps, 'v2', kids)).toBeUndefined()
  })

  it('reads where each value is marked from the PDF notes, longest label first', () => {
    const e = {
      entry: 'k', prompt_set: null, data: {},
      fields: [{ name: 'w', type: 'number' as const, label: 'Width' },
        { name: 'wm', type: 'number' as const, label: 'Width max' }],
    }
    const marks = marksFromNotes(e, [
      { page: 3, text: 'Width max: 1200 mm', colour: '#00ff00' },
      { page: 2, text: 'Width: 926 mm', colour: '#ff0000' },
      { page: 1, text: 'Width: 926 mm', colour: '#ff0000' },
      { page: 1, text: 'Unrelated note', colour: '#000000' },
    ])
    expect(marks).toEqual({ w: { page: 1, colour: '#ff0000' }, wm: { page: 3, colour: '#00ff00' } })
  })
})

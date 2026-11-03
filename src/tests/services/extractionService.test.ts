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
import { entryRows, entryTitle, formatValue } from '@/services/extractionService'

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
    expect(rows[1].location).toBeNull()
  })

  it('titles an entry by its prompt set', () => {
    expect(entryTitle({ entry: 'k', prompt_set: { id: 'ps', revision: 3, name: 'Doors' }, data: {} })).toBe('Doors r3')
    expect(entryTitle({ entry: 'k', prompt_set: null, data: {} })).toBe('Extracted values')
  })
})

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
import { extractFileRefUids, linkifyFileRefs } from '@/utils/fileRefs'

const UID = '5a23e207-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

describe('extractFileRefUids', () => {
  it('collects unique uids from "(file <uid>)" refs', () => {
    const text = `See (file ${UID}) and again (file ${UID}) plus (file abcdef12).`
    expect(extractFileRefUids(text)).toEqual([UID, 'abcdef12'])
  })

  it('ignores ordinary parenthetical prose and short tokens', () => {
    expect(extractFileRefUids('open the (file cabinet) near (file 3)')).toEqual([])
  })

  it('handles empty / missing input', () => {
    expect(extractFileRefUids('')).toEqual([])
  })
})

describe('linkifyFileRefs', () => {
  it('rewrites a ref into a data-file-uid anchor, keeping the parentheses', () => {
    const out = linkifyFileRefs(`Budget is in (file ${UID}).`, { [UID]: 'Q3.xlsx' })
    expect(out).toBe(`Budget is in (<a href="#" class="file-ref" data-file-uid="${UID}">📄 Q3.xlsx</a>).`)
  })

  it('uses a neutral placeholder when the name is not resolved yet', () => {
    const out = linkifyFileRefs(`(file ${UID})`, {})
    expect(out).toContain(`data-file-uid="${UID}"`)
    expect(out).toContain('📄 file')
    expect(out).not.toContain(UID.slice(0, 8) + '</a>') // never shows the raw uid as the label
  })

  it('escapes HTML in the resolved name (no injection)', () => {
    const out = linkifyFileRefs(`(file ${UID})`, { [UID]: '<img src=x onerror=alert(1)>.html' })
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('leaves text without refs untouched', () => {
    expect(linkifyFileRefs('no refs here', {})).toBe('no refs here')
  })
})

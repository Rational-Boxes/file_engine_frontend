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

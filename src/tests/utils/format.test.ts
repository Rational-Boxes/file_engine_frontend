import { describe, it, expect } from 'vitest'
import { formatSize, formatVersionTimestamp, versionFilename, formatDateTime, truncateMiddle } from '@/utils/format'

describe('truncateMiddle', () => {
  it('returns short strings unchanged', () => {
    expect(truncateMiddle('report.pdf', 40)).toBe('report.pdf')
    expect(truncateMiddle('', 40)).toBe('')
  })
  it('collapses the middle, keeping start and end (extension visible)', () => {
    const out = truncateMiddle('a-very-long-report-filename-final-v3.pdf', 20)
    expect(out.length).toBe(20)
    expect(out).toContain('…')
    expect(out.startsWith('a-very')).toBe(true)
    expect(out.endsWith('v3.pdf')).toBe(true) // tail (incl. extension) preserved
  })
})

describe('versionFilename', () => {
  it('inserts the version id before the extension', () => {
    expect(versionFilename('report.pdf', '20260626_164538')).toBe('report (20260626_164538).pdf')
  })

  it('handles names without an extension', () => {
    expect(versionFilename('README', 'v2')).toBe('README (v2)')
  })

  it('handles a leading dot / no real extension', () => {
    expect(versionFilename('.env', 'v1')).toBe('.env (v1)')
  })

  it('falls back to the version id when there is no name (never the blob UUID)', () => {
    expect(versionFilename('', '20260626_164538')).toBe('20260626_164538')
  })
})

describe('formatSize', () => {
  it('formats byte sizes', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(5_242_880)).toBe('5.0 MB')
  })
})

describe('formatDateTime', () => {
  it('renders a positive epoch-seconds value as a localized date-time', () => {
    const epoch = 1700000000
    const expected = new Date(epoch * 1000).toLocaleString()
    const out = formatDateTime(epoch)
    expect(out).toBe(expected)
    expect(out).not.toBe('')
    expect(out).not.toBe('—')
  })

  it('returns an em dash for 0 / falsy / invalid values', () => {
    expect(formatDateTime(0)).toBe('—')
    expect(formatDateTime(-5)).toBe('—')
    expect(formatDateTime(NaN)).toBe('—')
  })
})

describe('formatVersionTimestamp', () => {
  it('renders a "YYYYMMDD_HHMMSS.mmm" id as a localized date-time', () => {
    // Version ids are UTC (core uses gmtime), so the expected instant is built
    // with Date.UTC and then localized — keeping the assertion locale/TZ-agnostic
    // while proving we do NOT treat the UTC components as local time.
    const expected = new Date(Date.UTC(2026, 5, 25, 0, 58, 41, 132)).toLocaleString()
    expect(formatVersionTimestamp('20260625_005841.132')).toBe(expected)
  })

  it('handles ids without milliseconds', () => {
    const expected = new Date(Date.UTC(2026, 5, 25, 0, 58, 41, 0)).toLocaleString()
    expect(formatVersionTimestamp('20260625_005841')).toBe(expected)
  })

  it('falls back to the raw value for non-timestamp ids', () => {
    expect(formatVersionTimestamp('v3')).toBe('v3')
    expect(formatVersionTimestamp('')).toBe('—')
  })
})

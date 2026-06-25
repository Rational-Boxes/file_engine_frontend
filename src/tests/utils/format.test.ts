import { describe, it, expect } from 'vitest'
import { formatSize, formatVersionTimestamp } from '@/utils/format'

describe('formatSize', () => {
  it('formats byte sizes', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(5_242_880)).toBe('5.0 MB')
  })
})

describe('formatVersionTimestamp', () => {
  it('renders a "YYYYMMDD_HHMMSS.mmm" id as a localized date-time', () => {
    // Compare against the same local Date so the assertion is locale/TZ-agnostic.
    const expected = new Date(2026, 5, 25, 0, 58, 41, 132).toLocaleString()
    expect(formatVersionTimestamp('20260625_005841.132')).toBe(expected)
  })

  it('handles ids without milliseconds', () => {
    const expected = new Date(2026, 5, 25, 0, 58, 41, 0).toLocaleString()
    expect(formatVersionTimestamp('20260625_005841')).toBe(expected)
  })

  it('falls back to the raw value for non-timestamp ids', () => {
    expect(formatVersionTimestamp('v3')).toBe('v3')
    expect(formatVersionTimestamp('')).toBe('—')
  })
})

import { describe, it, expect } from 'vitest'
import { canDo, decodePermissions } from '@/utils/permissions'

describe('decodePermissions (bitmask → permission bits)', () => {
  it('decodes Read+Write+Manage', () => {
    expect(decodePermissions(0x400 | 0x200 | 0x800).map((p) => p.key)).toEqual(['r', 'w', 'm'])
  })

  it('decodes a single bit and an empty mask', () => {
    expect(decodePermissions(0x001).map((p) => p.key)).toEqual(['x'])
    expect(decodePermissions(0)).toEqual([])
  })
})

describe('access-level → action gating', () => {
  it('lets everyone open/download/info', () => {
    for (const lvl of ['user', 'editor', 'admin'] as const) {
      expect(canDo('open', lvl)).toBe(true)
      expect(canDo('download', lvl)).toBe(true)
      expect(canDo('info', lvl)).toBe(true)
    }
  })

  it('gates rename/delete behind editor+', () => {
    expect(canDo('rename', 'user')).toBe(false)
    expect(canDo('delete', 'user')).toBe(false)
    expect(canDo('rename', 'editor')).toBe(true)
    expect(canDo('delete', 'admin')).toBe(true)
  })

  it('lets everyone copy (read-only), but gates cut/paste behind editor+', () => {
    expect(canDo('copy', 'user')).toBe(true) // copy only reads the source
    expect(canDo('cut', 'user')).toBe(false)
    expect(canDo('paste', 'user')).toBe(false)
    expect(canDo('cut', 'editor')).toBe(true)
    expect(canDo('paste', 'editor')).toBe(true)
  })
})

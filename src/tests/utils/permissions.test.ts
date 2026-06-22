import { describe, it, expect } from 'vitest'
import { canDo } from '@/utils/permissions'

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
})

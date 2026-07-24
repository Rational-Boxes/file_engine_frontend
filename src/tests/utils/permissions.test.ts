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
import { canDo, decodePermissions, PERMS, PERM_BITS } from '@/utils/permissions'

describe('decodePermissions (bitmask → permission bits)', () => {
  it('decodes Read+Write+Manage', () => {
    expect(decodePermissions(0x400 | 0x200 | 0x800).map((p) => p.key)).toEqual(['r', 'w', 'm'])
  })

  it('decodes a single bit and an empty mask', () => {
    expect(decodePermissions(0x001).map((p) => p.key)).toEqual(['x'])
    expect(decodePermissions(0)).toEqual([])
  })

  it('decodes the CULL_VERSIONS bit (0x2000) the core added', () => {
    expect(decodePermissions(0x2000).map((p) => p.key)).toEqual(['CULL_VERSIONS'])
    // co-exists with the other version bits
    expect(decodePermissions(0x2000 | 0x400).map((p) => p.key)).toEqual(['r', 'CULL_VERSIONS'])
  })
})

describe('grantable permission vocabulary (PERMS)', () => {
  it('exposes the grantable set (CULL_VERSIONS in, EXECUTE decode-only)', () => {
    const keys = PERMS.map((p) => p.key)
    expect(keys).toContain('CULL_VERSIONS')
    expect(keys).toContain('i') // ACL_INHERIT is grantable
    expect(keys).not.toContain('x') // EXECUTE is compat-only, not grantable
    // PERMS is exactly the grantable subset of PERM_BITS
    expect(keys).toEqual(PERM_BITS.filter((p) => p.grantable !== false).map((p) => p.key))
    // ...but EXECUTE still decodes so stored entries display it
    expect(decodePermissions(0x001).map((p) => p.key)).toEqual(['x'])
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

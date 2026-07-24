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

import { describe, it, expect, beforeEach } from 'vitest'
import { safeRedirect, stashRedirect, takeRedirect } from '@/utils/redirect'

describe('safeRedirect (open-redirect guard)', () => {
  it('keeps absolute internal paths (incl. query)', () => {
    expect(safeRedirect('/files?file=abc&tenant=acme')).toBe('/files?file=abc&tenant=acme')
    expect(safeRedirect('/admin/tenant')).toBe('/admin/tenant')
  })

  it('rejects external / protocol-relative / junk targets (→ the dashboard landing)', () => {
    expect(safeRedirect('//evil.com')).toBe('/dashboard')
    expect(safeRedirect('https://evil.com')).toBe('/dashboard')
    expect(safeRedirect('javascript:alert(1)')).toBe('/dashboard')
    expect(safeRedirect('')).toBe('/dashboard')
    expect(safeRedirect(undefined)).toBe('/dashboard')
  })
})

describe('stash/takeRedirect (survives login round-trips)', () => {
  beforeEach(() => sessionStorage.clear())

  it('stashes a target and reads-and-clears it once', () => {
    stashRedirect('/files?file=abc&tenant=acme')
    expect(takeRedirect()).toBe('/files?file=abc&tenant=acme')
    expect(takeRedirect()).toBe('/dashboard') // cleared after first read → default landing
  })

  it('a meaningless target clears any stale stash', () => {
    stashRedirect('/files?file=abc')
    stashRedirect(undefined) // e.g. arriving at /login with no redirect
    expect(takeRedirect()).toBe('/dashboard')
  })
})

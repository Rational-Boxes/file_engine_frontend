import { describe, it, expect, beforeEach } from 'vitest'
import { safeRedirect, stashRedirect, takeRedirect } from '@/utils/redirect'

describe('safeRedirect (open-redirect guard)', () => {
  it('keeps absolute internal paths (incl. query)', () => {
    expect(safeRedirect('/files?file=abc&tenant=acme')).toBe('/files?file=abc&tenant=acme')
    expect(safeRedirect('/admin/roles')).toBe('/admin/roles')
  })

  it('rejects external / protocol-relative / junk targets', () => {
    expect(safeRedirect('//evil.com')).toBe('/files')
    expect(safeRedirect('https://evil.com')).toBe('/files')
    expect(safeRedirect('javascript:alert(1)')).toBe('/files')
    expect(safeRedirect('')).toBe('/files')
    expect(safeRedirect(undefined)).toBe('/files')
  })
})

describe('stash/takeRedirect (survives login round-trips)', () => {
  beforeEach(() => sessionStorage.clear())

  it('stashes a target and reads-and-clears it once', () => {
    stashRedirect('/files?file=abc&tenant=acme')
    expect(takeRedirect()).toBe('/files?file=abc&tenant=acme')
    expect(takeRedirect()).toBe('/files') // cleared after first read
  })

  it('a meaningless target clears any stale stash', () => {
    stashRedirect('/files?file=abc')
    stashRedirect(undefined) // e.g. arriving at /login with no redirect
    expect(takeRedirect()).toBe('/files')
  })
})

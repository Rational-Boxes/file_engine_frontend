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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tenantFromHostname } from '@/utils/tenantHost'
import { chooseTenant } from '@/utils/lastTenant'

function at(href: string) {
  const u = new URL(href)
  vi.stubGlobal('window', {
    location: {
      protocol: u.protocol, hostname: u.hostname, port: u.port,
      pathname: u.pathname, search: u.search, hash: u.hash, href,
    },
    localStorage: window.localStorage,
  })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('the login label is never a tenant', () => {
  it('does not resolve as a tenant', () => {
    // A tenant literally named "login" would shadow the sign-in page for
    // everybody, so the label is reserved on both sides of the wire.
    expect(tenantFromHostname('login.example.com')).toBeNull()
  })

  it('is not smuggled in through the <tenant>-<interface> convention', () => {
    // There is no such host in practice — WebDAV is per-tenant and login is not
    // a tenant — but if one were pointed at the stack it must not become
    // a tenant called "login".
    expect(tenantFromHostname('login-drive.example.com')).toBeNull()
  })

  it('leaves real tenants alone, including their drive host', () => {
    expect(tenantFromHostname('acme.example.com')).toBe('acme')
    expect(tenantFromHostname('acme-drive.example.com')).toBe('acme')
  })

  it('does not reserve names that merely start with it', () => {
    expect(tenantFromHostname('logins.example.com')).toBe('logins')
  })
})

describe('choosing where to send someone', () => {
  it('uses the remembered workspace when they still have it', async () => {
    expect(chooseTenant(['acme', 'someco'], 'someco')).toBe('someco')
  })

  it('falls back to the first when the memory is stale', () => {
    // Access changes. The hint must never override what the token allows —
    // it is read by an origin that has authenticated nobody yet.
    expect(chooseTenant(['acme', 'someco'], 'departed-co')).toBe('acme')
  })

  it('takes the first on a first sign-in, with nothing remembered', () => {
    expect(chooseTenant(['acme', 'someco'], null)).toBe('acme')
  })

  it('returns nothing when the user belongs to nothing', () => {
    // Better to say "you are in no workspace" than to redirect into an empty
    // app, or loop back to the login page.
    expect(chooseTenant([], 'acme')).toBeNull()
  })
})

describe('the sign-in label is configurable at run time', () => {
  it('reserves whatever the bridge says, not a baked-in name', async () => {
    // A deployment may be unable to reserve "login" on its domain, so the SPA
    // learns the label from the bridge at bootstrap. Baking it in would repeat
    // the mistake the provider list just had fixed.
    const m = await import('@/utils/tenantHost')
    m.setLoginLabel('signin')
    expect(m.tenantFromHostname('signin.example.com')).toBeNull()
    expect(m.tenantFromHostname('login.example.com')).toBe('login')
    at('https://signin.example.com/login')
    expect(m.isLoginOrigin()).toBe(true)
    m.setLoginLabel('login')   // restore
  })

  it('ignores an empty label rather than reserving everything', async () => {
    const m = await import('@/utils/tenantHost')
    m.setLoginLabel('')
    expect(m.getLoginLabel()).toBe('login')
  })
})

describe('login origin helpers', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it('recognises the sign-in origin, and only the exact label', async () => {
    const { isLoginOrigin } = await import('@/utils/tenantHost')
    at('https://login.example.com/login')
    expect(isLoginOrigin()).toBe(true)
    at('https://acme.example.com/files')
    expect(isLoginOrigin()).toBe(false)
    // Not the login origin: WebDAV is per-tenant, so this host should not exist
    // at all — and if it did it must not be treated as the sign-in page.
    at('https://login-drive.example.com/')
    expect(isLoginOrigin()).toBe(false)
  })

  it('builds a login URL carrying the path and tenant separately', async () => {
    const { loginUrl } = await import('@/utils/tenantHost')
    at('https://acme.example.com/files?file=X')
    const url = new URL(loginUrl('/files?file=X', 'acme')!)
    expect(url.hostname).toBe('login.example.com')
    // A PATH, never a full URL — a full URL here would be an open redirect,
    // and the tenant travels separately so the target is reconstructed.
    expect(url.searchParams.get('next')).toBe('/files?file=X')
    expect(url.searchParams.get('t')).toBe('acme')
  })

  it('returns the tenant origin without dragging the current path along', async () => {
    const { tenantOrigin } = await import('@/utils/tenantHost')
    at('https://login.example.com/login?next=%2Ffiles')
    expect(tenantOrigin('acme')).toBe('https://acme.example.com')
  })

  it('preserves the port, so a dev origin still works', async () => {
    const { loginUrl, tenantOrigin } = await import('@/utils/tenantHost')
    at('http://default.localtest.me:3000/files')
    expect(loginUrl('/files', 'default')).toContain('login.localtest.me:3000')
    expect(tenantOrigin('acme')).toBe('http://acme.localtest.me:3000')
  })

  it('gives no parent cookie domain for a bare host', async () => {
    // localhost and IP literals have no parent to scope a cookie to; the
    // localStorage fallback is what keeps the memory working there.
    const { parentCookieDomain } = await import('@/utils/tenantHost')
    at('http://localhost:3000/')
    expect(parentCookieDomain()).toBeNull()
    at('http://127.0.0.1:3000/')
    expect(parentCookieDomain()).toBeNull()
    at('http://acme.example.com/')
    expect(parentCookieDomain()).toBe('.example.com')
  })
})

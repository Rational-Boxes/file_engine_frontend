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

// The paths ldap_manager actually mails out.
//
// Its links are built from INVITE_LINK_BASE / RESET_LINK_BASE, and the Ansible
// defaults end those in `/invite` and `/reset`. Neither had a route, so every
// invitation and every password reset landed on an empty <div id="app"> — a 200
// from the server, nothing in the console, nothing in any log.
import { describe, it, expect } from 'vitest'
import router from '@/router'

// resolve() only matches; it does not run the navigation guards, so the app's
// own router instance is safe to interrogate directly.
const testRouter = () => router

describe('public account routes', () => {
  it.each([
    ['/invite', 'SetPassword'],
    ['/set-password', 'SetPassword'],
    ['/reset', 'ResetPassword'],
    ['/reset-password', 'ResetPassword'],
  ])('%s resolves to %s', (path, name) => {
    const r = testRouter().resolve(path)
    expect(r.name).toBe(name)
  })

  it('carries the token through on the aliased paths', () => {
    // Both views read route.query.token, so the alias only works if the query
    // survives — which is the whole point of the mailed link.
    for (const p of ['/invite', '/reset']) {
      expect(testRouter().resolve(`${p}?token=abc123`).query.token).toBe('abc123')
    }
  })

  it('leaves the mailed routes public', () => {
    // requiresAuth would bounce an invited user to a login they cannot pass:
    // they have no password yet, which is the entire reason they were sent here.
    for (const p of ['/invite', '/set-password', '/reset', '/reset-password']) {
      expect(testRouter().resolve(p).meta.requiresAuth).toBe(false)
    }
  })
})

describe('unmatched paths', () => {
  it('resolves to NotFound instead of nothing', () => {
    // With no catch-all, vue-router matches no record and the app renders a
    // blank page — which is how the two bugs above stayed invisible.
    const r = testRouter().resolve('/no-such-page')
    expect(r.name).toBe('NotFound')
    expect(r.matched.length).toBeGreaterThan(0)
  })

  it('does not require auth to be told a page is missing', () => {
    expect(testRouter().resolve('/no-such-page').meta.requiresAuth).toBe(false)
  })

  it('still resolves every real route ahead of the catch-all', () => {
    for (const p of ['/login', '/dashboard', '/files', '/admin/tenant', '/profile']) {
      expect(testRouter().resolve(p).name).not.toBe('NotFound')
    }
  })
})

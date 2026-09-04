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

/**
 * The workspace memory belongs to a PERSON, not to a browser.
 *
 * One name for the whole machine is what turned a convenience into the login
 * bug: user A's workspace was aimed at user B's sign-in, and B — who is not in
 * it — got "not a member of the requested tenant" for an account that was
 * perfectly fine. Keyed per user, A's memory waits for A and is invisible to B.
 *
 * And the key is a hash, because the usernames here are email addresses and
 * localStorage is readable by anything that can run in the page (and by anyone
 * looking over a shoulder in devtools).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  chooseTenant,
  forgetTenantFor,
  getLastTenantFor,
  rememberTenantFor,
} from '@/utils/lastTenant'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'

beforeEach(() => {
  window.localStorage.clear()
  // jsdom has no parent domain to scope a cookie to, so the localStorage half
  // is what these exercise — which is also the dev-tunnel case the fallback
  // exists for.
  document.cookie = 'fe_last_tenant=; Max-Age=0; Path=/'
})

describe('remembering where someone works', () => {
  it('gives each user back their own workspace', () => {
    rememberTenantFor(ALICE, 'acme')
    rememberTenantFor(BOB, 'someco')

    expect(getLastTenantFor(ALICE)).toBe('acme')
    expect(getLastTenantFor(BOB)).toBe('someco')
  })

  it('tells us nothing about someone we have not seen', () => {
    rememberTenantFor(ALICE, 'acme')

    // The whole bug in one assertion: a stranger must not inherit Alice's
    // workspace just because she used this browser first.
    expect(getLastTenantFor('carol@example.com')).toBeNull()
    expect(getLastTenantFor(null)).toBeNull()
  })

  it('keeps only the latest workspace per user', () => {
    rememberTenantFor(ALICE, 'acme')
    rememberTenantFor(ALICE, 'someco')

    expect(getLastTenantFor(ALICE)).toBe('someco')
  })

  it('is case- and whitespace-insensitive about the address', () => {
    // The name is typed at a login form. "Alice@Example.com " is Alice.
    rememberTenantFor(ALICE, 'acme')
    expect(getLastTenantFor(' Alice@Example.com ')).toBe('acme')
  })

  it('forgets one user without disturbing anyone else', () => {
    rememberTenantFor(ALICE, 'acme')
    rememberTenantFor(BOB, 'someco')

    forgetTenantFor(ALICE)

    expect(getLastTenantFor(ALICE)).toBeNull()
    expect(getLastTenantFor(BOB)).toBe('someco')
  })

  it('bounds what it keeps, dropping whoever signed in longest ago', () => {
    for (let i = 0; i < 12; i++) rememberTenantFor(`user${i}@example.com`, `t${i}`)

    expect(getLastTenantFor('user11@example.com')).toBe('t11') // most recent, kept
    expect(getLastTenantFor('user0@example.com')).toBeNull() // oldest, dropped
    // It rides on a cookie sent with every request to the domain, so it cannot
    // be allowed to grow with every account that ever touched this browser.
    expect(JSON.parse(window.localStorage.getItem('fe_last_tenant') as string)).toHaveLength(8)
  })
})

describe('what actually lands in storage', () => {
  it('does not write the address anywhere', () => {
    rememberTenantFor(ALICE, 'acme')

    const stored = window.localStorage.getItem('fe_last_tenant') as string
    expect(stored).not.toContain('alice')
    expect(stored).not.toContain('@example.com')
    expect(stored).toContain('acme') // the tenant name is not a secret
    expect(document.cookie).not.toContain('alice')
  })

  it('hashes deterministically, or the lookup could never find anything', () => {
    rememberTenantFor(ALICE, 'acme')
    const first = window.localStorage.getItem('fe_last_tenant')
    window.localStorage.clear()
    rememberTenantFor(ALICE, 'acme')

    expect(window.localStorage.getItem('fe_last_tenant')).toBe(first)
  })

  it('treats an unreadable store as an empty one', () => {
    // Including the shape this replaced — a bare tenant name for the whole
    // browser. Nothing to migrate: we cannot know whose it was, and the next
    // sign-in rewrites it.
    window.localStorage.setItem('fe_last_tenant', 'acme')
    expect(getLastTenantFor(ALICE)).toBeNull()

    window.localStorage.setItem('fe_last_tenant', '{not json')
    expect(getLastTenantFor(ALICE)).toBeNull()

    rememberTenantFor(ALICE, 'someco')
    expect(getLastTenantFor(ALICE)).toBe('someco')
  })
})

describe('the memory is still only a hint', () => {
  it('is ignored when the token no longer carries that workspace', () => {
    rememberTenantFor(ALICE, 'departed-co')
    expect(chooseTenant(['acme', 'someco'], getLastTenantFor(ALICE))).toBe('acme')
  })

  it('is honoured when it is still one of theirs', () => {
    rememberTenantFor(ALICE, 'someco')
    expect(chooseTenant(['acme', 'someco'], getLastTenantFor(ALICE))).toBe('someco')
  })
})

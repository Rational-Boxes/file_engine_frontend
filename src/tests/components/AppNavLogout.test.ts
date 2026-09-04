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

/** Where "Sign out" sends you. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const push = vi.fn()
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot/></a>' },
}))
vi.mock('@/components/TenantSelector.vue', () => ({
  default: { name: 'TenantSelector', template: '<div/>' },
}))
vi.mock('@/services/authService', () => ({
  authService: { logout: vi.fn().mockResolvedValue(undefined) },
}))

import AppNav from '@/components/AppNav.vue'
import { useAuthStore } from '@/stores/auth'

/** Point window.location at `href`, leaving the rest of window intact — replacing
 *  the whole object breaks vue-test-utils, which builds DOM events from it.
 *  location.replace is a spy that also moves href, since sign-out replaces the
 *  current entry rather than pushing a new one. */
const realLocation = window.location
function at(href: string) {
  const u = new URL(href)
  const loc: Record<string, unknown> = {
    protocol: u.protocol, hostname: u.hostname, port: u.port,
    pathname: u.pathname, search: u.search, hash: u.hash, href,
  }
  loc.replace = vi.fn((to: string) => { loc.href = to })
  Object.defineProperty(window, 'location', {
    value: loc, writable: true, configurable: true,
  })
}
function restoreLocation() {
  Object.defineProperty(window, 'location', {
    value: realLocation, writable: true, configurable: true,
  })
}

async function signOut() {
  const w = mount(AppNav)
  await w.findAll('button').find((b) => b.text() === 'Sign out')!.trigger('click')
  await flushPromises()
}

describe('signing out goes to the login route', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear(); replace.mockClear()
    const auth = useAuthStore()
    auth.token = 'tok'
    auth.user = 'alice'
    auth.tenant = 'acme'
  })
  afterEach(() => { restoreLocation(); vi.unstubAllGlobals() })

  it('sends a bare host to the in-app /login form', async () => {
    at('http://localhost:3000/dashboard')
    await signOut()
    // replace, not push: the dashboard behind us belongs to a session that no
    // longer exists, and Back must not return to it.
    expect(replace).toHaveBeenCalledWith('/login')
    expect(push).not.toHaveBeenCalled()
  })

  it('forwards to the bespoke login subdomain from a tenant origin', async () => {
    at('https://acme.example.com/dashboard')
    await signOut()
    expect(window.location.href).toContain('https://login.example.com/login')
    expect(push).not.toHaveBeenCalled()
  })

  it('tells the sign-in origin this was a sign-out', async () => {
    // That origin holds a token of its OWN, minted when the user signed in
    // there. Arriving without saying so, it finds that session still valid and
    // hands the user back to a workspace — sign-out looking like a no-op, with
    // the session left live for whoever uses the machine next.
    at('https://acme.example.com/dashboard')
    await signOut()
    expect(window.location.href).toContain('signedout=1')
  })

  it('does not leak the workspace to the sign-in page', async () => {
    // The workspace memory is per user now and keyed by a hash, so the sign-in
    // page recovers it for whoever actually signs in. Putting ?t=acme on the URL
    // instead would aim the NEXT person's sign-in at this user's workspace,
    // which is the bug this whole change exists to close.
    at('https://acme.example.com/dashboard')
    await signOut()
    expect(window.location.href).not.toContain('acme')
  })

  it('stays in-app when already on the sign-in origin', async () => {
    // login.example.com IS the sign-in page; forwarding it to itself would be a
    // reload at best and a loop at worst. This is the "served from here" case —
    // the tenant subdomain was unreachable — so what must NOT happen is being
    // left on, or sent back to, a dashboard on an origin that is no tenant's.
    at('https://login.example.com/dashboard')
    await signOut()
    expect(replace).toHaveBeenCalledWith({ path: '/login', query: { signedout: '1' } })
    expect(push).not.toHaveBeenCalled()
    expect(window.location.href).toBe('https://login.example.com/dashboard')
  })

  it('falls back to the in-app form when the host has no label to swap', async () => {
    // An IP or a bare hostname cannot yield a login subdomain, and loginUrl()
    // returns null rather than inventing one.
    at('http://192.168.1.10/dashboard')
    await signOut()
    expect(replace).toHaveBeenCalledWith('/login')
  })

  it('clears the session', async () => {
    at('http://localhost:3000/dashboard')
    const auth = useAuthStore()
    await signOut()
    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
  })
})

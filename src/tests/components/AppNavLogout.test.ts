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
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
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
 *  the whole object breaks vue-test-utils, which builds DOM events from it. */
const realLocation = window.location
function at(href: string) {
  const u = new URL(href)
  Object.defineProperty(window, 'location', {
    value: { protocol: u.protocol, hostname: u.hostname, port: u.port,
             pathname: u.pathname, search: u.search, hash: u.hash, href },
    writable: true, configurable: true,
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
    push.mockClear()
    const auth = useAuthStore()
    auth.token = 'tok'
    auth.user = 'alice'
    auth.tenant = 'acme'
  })
  afterEach(() => { restoreLocation(); vi.unstubAllGlobals() })

  it('sends a bare host to the in-app /login form', async () => {
    at('http://localhost:3000/dashboard')
    await signOut()
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('forwards to the bespoke login subdomain from a tenant origin', async () => {
    at('https://acme.example.com/dashboard')
    await signOut()
    expect(window.location.href).toBe('https://login.example.com/login')
    expect(push).not.toHaveBeenCalled()
  })

  it('does not leak the workspace to the sign-in page', async () => {
    // clearLastTenant() deliberately forgets the workspace on an explicit sign
    // out, so the next person on a shared machine meets a clean login. Putting
    // ?t=acme on the URL would hand it straight back.
    at('https://acme.example.com/dashboard')
    await signOut()
    expect(window.location.href).not.toContain('acme')
  })

  it('stays in-app when already on the sign-in origin', async () => {
    // login.example.com IS the sign-in page; forwarding it to itself would be a
    // reload at best and a loop at worst.
    at('https://login.example.com/dashboard')
    await signOut()
    expect(push).toHaveBeenCalledWith('/login')
    expect(window.location.href).toBe('https://login.example.com/dashboard')
  })

  it('falls back to the in-app form when the host has no label to swap', async () => {
    // An IP or a bare hostname cannot yield a login subdomain, and loginUrl()
    // returns null rather than inventing one.
    at('http://192.168.1.10/dashboard')
    await signOut()
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('clears the session', async () => {
    at('http://localhost:3000/dashboard')
    const auth = useAuthStore()
    await signOut()
    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
  })
})

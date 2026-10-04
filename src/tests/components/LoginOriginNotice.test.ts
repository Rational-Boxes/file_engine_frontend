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
 * The sign-in-origin fallback must be visible.
 *
 * Twice in production a router web filter blocked the tenant subdomain and the
 * app silently ran from login.<base>, where uploads cap at 1 MB and the
 * optional services are not routed — which read as a broken deploy. The notice
 * names the unreachable address, and its retry really re-probes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { reachable, forget, push } = vi.hoisted(() => ({
  reachable: vi.fn(), forget: vi.fn(), push: vi.fn(),
}))
vi.mock('@/utils/tenantReach', () => ({
  tenantOriginReachable: reachable, forgetReachability: forget,
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ fullPath: '/files?folder=abc' }),
}))

import LoginOriginNotice from '@/components/LoginOriginNotice.vue'
import { useAuthStore } from '@/stores/auth'
import {
  markServingFromLoginOrigin, resetServingFromLoginOrigin, servingFromLoginOrigin,
} from '@/utils/loginOriginServe'

function at(host: string) {
  vi.stubGlobal('window', Object.assign(Object.create(window), {
    location: { protocol: 'https:', hostname: host, port: '', pathname: '/files',
                search: '', hash: '', href: `https://${host}/files` },
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
  }))
}

function mountNotice(host = 'login.example.com') {
  at(host)
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'a-token'
  auth.tenant = 'default'
  auth.tenants = ['default']
  return mount(LoginOriginNotice)
}

beforeEach(() => {
  reachable.mockReset(); forget.mockReset(); push.mockReset()
  resetServingFromLoginOrigin()
})
afterEach(() => { vi.unstubAllGlobals(); resetServingFromLoginOrigin() })

describe('LoginOriginNotice', () => {
  it('says nothing on an ordinary visit', () => {
    expect(mountNotice().find('[data-test="login-origin-notice"]').exists()).toBe(false)
  })

  it('appears when the fallback is taken, naming the address that failed', async () => {
    const w = mountNotice()
    markServingFromLoginOrigin('https://default.example.com')
    await flushPromises()
    const text = w.find('[data-test="login-origin-notice"]').text()
    expect(text).toContain('default.example.com')
    expect(text).toMatch(/couldn't be reached from this network/)
  })

  it('never shows on a tenant origin, even with the flag set', async () => {
    markServingFromLoginOrigin('https://default.example.com')
    const w = mountNotice('default.example.com')
    await flushPromises()
    expect(w.find('[data-test="login-origin-notice"]').exists()).toBe(false)
  })

  it('retry re-probes from scratch and reports a still-blocked address', async () => {
    reachable.mockResolvedValue(false)
    markServingFromLoginOrigin('https://default.example.com')
    const w = mountNotice()
    await w.find('[data-test="login-origin-retry"]').trigger('click')
    await flushPromises()
    // Without forgetting the cached "no", the button could never succeed.
    expect(forget).toHaveBeenCalledWith('https://default.example.com')
    expect(reachable).toHaveBeenCalledWith('https://default.example.com')
    expect(w.find('[data-test="login-origin-still"]').exists()).toBe(true)
    expect(push).not.toHaveBeenCalled()
    expect(servingFromLoginOrigin()).toBe(true)
  })

  it('retry hands over through the login view once the address answers', async () => {
    reachable.mockResolvedValue(true)
    markServingFromLoginOrigin('https://default.example.com')
    const w = mountNotice()
    await w.find('[data-test="login-origin-retry"]').trigger('click')
    await flushPromises()
    expect(servingFromLoginOrigin()).toBe(false)
    expect(push).toHaveBeenCalledWith({ path: '/login',
      query: { next: '/files?folder=abc', t: 'default' } })
  })

  it('can be dismissed', async () => {
    markServingFromLoginOrigin('https://default.example.com')
    const w = mountNotice()
    await w.find('[data-test="login-origin-dismiss"]').trigger('click')
    expect(w.find('[data-test="login-origin-notice"]').exists()).toBe(false)
  })
})

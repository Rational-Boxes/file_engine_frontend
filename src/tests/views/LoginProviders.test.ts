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
 * Which sign-in buttons the login screen offers.
 *
 * The list used to come from a BUILD-TIME variable, so the packaged SPA offered
 * every deployment the same providers and a button for an IdP nobody had
 * configured led straight to an error. It is now asked of the bridge on mount.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { oauthProviders, oauthRedirect, login } = vi.hoisted(() => ({
  oauthProviders: vi.fn(), oauthRedirect: vi.fn(), login: vi.fn(),
}))

vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<object>('@/services/authService')
  const svc = { oauthProviders, oauthRedirect, login }
  return { ...actual, authService: svc, default: svc }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import LoginView from '@/views/LoginView.vue'

function mountLogin() {
  setActivePinia(createPinia())
  return mount(LoginView, {
    global: { stubs: { RouterLink: true, TwoFactorChallenge: true } },
  })
}

beforeEach(() => {
  oauthProviders.mockReset(); oauthRedirect.mockReset()
  oauthProviders.mockResolvedValue([])
})

describe('LoginView — provider buttons', () => {
  it('shows no provider buttons when nothing is configured', async () => {
    // The reported behaviour: with no IdP set up there should be no button at
    // all, not a button that fails when pressed.
    const w = mountLogin()
    await flushPromises()
    expect(w.find('.providers').exists()).toBe(false)
    expect(w.find('.divider').exists()).toBe(false)
    // ...and the password form is still the whole login screen.
    expect(w.find('input[type="password"]').exists()).toBe(true)
  })

  it('shows a button for each provider the bridge reports', async () => {
    oauthProviders.mockResolvedValue(['microsoft', 'linkedin'])
    const w = mountLogin()
    await flushPromises()
    const labels = w.findAll('.btn-provider').map((b) => b.text())
    expect(labels).toHaveLength(2)
    expect(labels.join()).toContain('Microsoft')
    expect(labels.join()).toContain('LinkedIn')
  })

  it('uses each provider’s own capitalisation', async () => {
    // "Github" and "Linkedin" read as a bug to anyone who knows the brands.
    oauthProviders.mockResolvedValue(['github', 'linkedin', 'gitlab'])
    const w = mountLogin()
    await flushPromises()
    const text = w.findAll('.btn-provider').map((b) => b.text()).join()
    expect(text).toContain('GitHub')
    expect(text).toContain('LinkedIn')
    expect(text).toContain('GitLab')
  })

  it('falls back to capitalisation for a self-hosted provider', async () => {
    oauthProviders.mockResolvedValue(['keycloak', 'corp-idp'])
    const w = mountLogin()
    await flushPromises()
    const text = w.findAll('.btn-provider').map((b) => b.text()).join()
    expect(text).toContain('Keycloak')
    expect(text).toContain('Corp-idp')
  })

  it('renders an icon beside each provider', async () => {
    oauthProviders.mockResolvedValue(['microsoft'])
    const w = mountLogin()
    await flushPromises()
    expect(w.findComponent({ name: 'ProviderIcon' }).exists()).toBe(true)
  })

  it('hides the buttons when the bridge cannot be reached', async () => {
    // An old bridge has no such endpoint, and an unreachable one answers
    // nothing. Both must fail CLOSED — showing nothing rather than guessing.
    oauthProviders.mockResolvedValue([])
    const w = mountLogin()
    await flushPromises()
    expect(w.find('.providers').exists()).toBe(false)
  })

  it('starts the flow for the provider that was clicked', async () => {
    oauthProviders.mockResolvedValue(['google', 'microsoft'])
    const w = mountLogin()
    await flushPromises()
    const ms = w.findAll('.btn-provider').find((b) => b.text().includes('Microsoft'))!
    await ms.trigger('click')
    expect(oauthRedirect).toHaveBeenCalledWith('microsoft')
  })
})

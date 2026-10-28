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

// The REST API scope on generated credentials: the card offers it, sends it as
// "api", and, for a key that carries it, shows a sign-in example that exchanges
// the key for a session token — without ever writing the secret into it.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { listServiceCredentials, createServiceCredential } = vi.hoisted(() => ({
  listServiceCredentials: vi.fn(), createServiceCredential: vi.fn(),
}))

vi.mock('@/services/ldapAdminService', async () => {
  const actual = await vi.importActual<object>('@/services/ldapAdminService')
  return { ...actual, ldapAdminService: { listServiceCredentials, createServiceCredential } }
})

import WebDavCredentials from '@/components/WebDavCredentials.vue'

const SECRET = 'fesks_never-in-a-script'

function mountCard() {
  return mount(WebDavCredentials, { global: { stubs: { HelpIcon: true } } })
}

async function createWith(scopes: string[]) {
  createServiceCredential.mockResolvedValue({ key_id: 'fesk_abc', secret: SECRET, scopes })
  const w = mountCard()
  await flushPromises()
  // Start from no scopes, then tick exactly the ones asked for.
  for (const box of w.findAll('.create-row input[type="checkbox"]')) {
    const el = box.element as HTMLInputElement
    if (el.checked !== scopes.includes(el.value)) await box.setValue(!el.checked)
  }
  await w.find('.create-row .btn').trigger('click')
  await flushPromises()
  return w
}

beforeEach(() => {
  listServiceCredentials.mockReset().mockResolvedValue([])
  createServiceCredential.mockReset()
})

describe('WebDavCredentials — REST API scope', () => {
  it('offers REST API alongside WebDAV and MCP', async () => {
    const w = mountCard()
    await flushPromises()
    const values = w.findAll('.create-row input[type="checkbox"]')
      .map((b) => (b.element as HTMLInputElement).value)
    expect(values).toEqual(['webdav', 'mcp', 'api'])
    expect(w.text()).toContain('REST API')
  })

  it('creates a credential scoped "api" when only REST API is ticked', async () => {
    await createWith(['api'])
    expect(createServiceCredential).toHaveBeenCalledWith('', ['api'])
  })

  it('shows the API example only for a key that carries the api scope', async () => {
    const dav = await createWith(['webdav'])
    expect(dav.findAll('button').some((b) => b.text() === 'API example')).toBe(false)

    const api = await createWith(['api'])
    const btn = api.findAll('button').find((b) => b.text() === 'API example')
    expect(btn).toBeTruthy()
    // A REST-only key has no WebDAV mount scripts.
    expect(api.findAll('button').some((b) => b.text().startsWith('Mount script'))).toBe(false)
  })

  it('the API example exchanges the key for a renewable session and never embeds the secret', async () => {
    const w = await createWith(['api'])
    await w.findAll('button').find((b) => b.text() === 'API example')!.trigger('click')
    const script = w.find('pre code').text()
    expect(script).toContain('KEY="fesk_abc"')
    expect(script).toContain('/api"')
    expect(script).toContain('/v1/auth/token')
    expect(script).toContain('/v1/auth/refresh')
    expect(script).toContain('curl -sf -K -')   // credential on stdin, not argv
    expect(script).not.toContain(SECRET)
    expect(w.text()).toContain('fileengine-api-session.sh')
  })
})

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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { listTemplates, getTemplate } = vi.hoisted(() => ({
  listTemplates: vi.fn(), getTemplate: vi.fn(),
}))

vi.mock('@/services/ldapAdminService', async () => {
  const actual = await vi.importActual<object>('@/services/ldapAdminService')
  return { ...actual, ldapAdminService: { listTemplates, getTemplate } }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ hasAccessLevel: () => true }),
}))

import AccountEmailTemplates from '@/components/system/AccountEmailTemplates.vue'

const KINDS = [
  { kind: 'new_user', customized: false },
  { kind: 'access_granted', customized: false },
  { kind: '2fa_email_code', customized: false },
  { kind: 'share_otp_code', customized: false },
]

beforeEach(() => {
  setActivePinia(createPinia())
  listTemplates.mockReset(); getTemplate.mockReset()
  listTemplates.mockResolvedValue(KINDS)
  getTemplate.mockResolvedValue({ kind: 'new_user', subject: 's', body: 'b' })
})

describe('account email template tabs', () => {
  it('labels each tab by what the email is, not by its storage key', async () => {
    const w = mount(AccountEmailTemplates)
    await flushPromises()
    const labels = w.findAll('.subtabs button').map((b) => b.text().replace('•', '').trim())
    expect(labels).toEqual(['Invitation', 'Access granted', 'Sign-in code', 'Share link code'])
  })

  it('shows no raw machine key as a label', async () => {
    const w = mount(AccountEmailTemplates)
    await flushPromises()
    for (const b of w.findAll('.subtabs button')) {
      expect(b.text()).not.toMatch(/_/)
    }
  })

  it('keeps the machine key discoverable as a tooltip', async () => {
    // Renaming the visible label must not cost an administrator the identifier
    // that appears in logs and in the API.
    const w = mount(AccountEmailTemplates)
    await flushPromises()
    expect(w.findAll('.subtabs button').map((b) => b.attributes('title')))
      .toEqual(['new_user', 'access_granted', '2fa_email_code', 'share_otp_code'])
  })

  it('still renders a readable label for a kind it does not know', async () => {
    // A kind added server-side must not come out as an empty tab in an older SPA.
    listTemplates.mockResolvedValue([{ kind: 'quota_warning', customized: false }])
    const w = mount(AccountEmailTemplates)
    await flushPromises()
    expect(w.find('.subtabs button').text().replace('•', '').trim()).toBe('Quota warning')
  })
})

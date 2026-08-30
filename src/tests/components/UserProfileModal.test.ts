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
import { mount, flushPromises } from '@vue/test-utils'

const svc = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  setUserRoles: vi.fn(),
  removeUser: vi.fn(),
  reinvite: vi.fn(),
}))

vi.mock('@/services/ldapAdminService', async () => {
  const actual = await vi.importActual<object>('@/services/ldapAdminService')
  return { ...actual, ldapAdminService: svc }
})

import UserProfileModal from '@/components/admin/UserProfileModal.vue'

const ROLES = [
  { name: 'administrators', dn: 'cn=administrators', member_count: 2 },
  { name: 'editors', dn: 'cn=editors', member_count: 3 },
  { name: 'viewers', dn: 'cn=viewers', member_count: 1 },
]

function profile(over: Record<string, unknown> = {}) {
  return {
    uid: 'ann@x.test', email: 'ann@x.test', display_name: 'Ann Adams',
    given_name: 'Ann', surname: 'Adams', avatar_url: '', tenant: 'acme',
    roles: ['editors'], is_admin: false, other_tenant_count: 0, ...over,
  }
}

// Teleport puts the panel on document.body, so assertions read the document.
function mountModal(uid: string | null = 'ann@x.test', selfUid = 'boss@x.test') {
  return mount(UserProfileModal, {
    props: { uid, roles: ROLES, selfUid },
    attachTo: document.body,
  })
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[]

beforeEach(() => {
  vi.clearAllMocks()
  svc.getUserProfile.mockResolvedValue(profile())
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('UserProfileModal', () => {
  it('loads the profile from the server rather than trusting a roster row', async () => {
    mountModal()
    await flushPromises()
    expect(svc.getUserProfile).toHaveBeenCalledWith('ann@x.test')
    expect($('.up-name')?.textContent).toContain('Ann Adams')
    expect($('.up-facts')?.textContent).toContain('Ann')
  })

  it('renders nothing while closed', () => {
    mountModal(null)
    expect($('.up-panel')).toBeNull()
    expect(svc.getUserProfile).not.toHaveBeenCalled()
  })

  it('ticks the roles the user already holds', async () => {
    mountModal()
    await flushPromises()
    const boxes = $$('.up-roles input') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([false, true, false])
  })

  it('sends the whole role set and leaves the diffing to the server', async () => {
    svc.setUserRoles.mockResolvedValue(profile({ roles: ['editors', 'viewers'] }))
    const w = mountModal()
    await flushPromises()
    const viewers = $$('.up-roles input')[2] as HTMLInputElement
    viewers.click()
    await flushPromises()
    ;($('.up-primary') as HTMLButtonElement).click()
    await flushPromises()
    expect(svc.setUserRoles).toHaveBeenCalledWith('ann@x.test', ['editors', 'viewers'])
    expect(w.emitted('changed')).toBeTruthy()
    expect($('.up-ok')?.textContent).toContain('Saved')
  })

  it('cannot save until something changes, and Reset puts it back', async () => {
    mountModal()
    await flushPromises()
    const save = $('.up-primary') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    ;($$('.up-roles input')[2] as HTMLInputElement).click()
    await flushPromises()
    expect((($('.up-primary') as HTMLButtonElement)).disabled).toBe(false)
    const reset = $$('.up-actions .up-btn').find((b) => b.textContent?.includes('Reset'))!
    reset.click()
    await flushPromises()
    expect((($('.up-primary') as HTMLButtonElement)).disabled).toBe(true)
  })

  it('refuses to save an empty role set and says where to go instead', async () => {
    // Unticking everything is a removal, and removal has its own confirmation.
    mountModal()
    await flushPromises()
    ;($$('.up-roles input')[1] as HTMLInputElement).click()
    await flushPromises()
    expect(($('.up-primary') as HTMLButtonElement).disabled).toBe(true)
    expect($('.up-warn')?.textContent).toContain('at least one role')
    expect(svc.setUserRoles).not.toHaveBeenCalled()
  })

  it('locks the admin box for the signed-in admin, with the reason shown', async () => {
    svc.getUserProfile.mockResolvedValue(
      profile({ uid: 'boss@x.test', roles: ['administrators'], is_admin: true }),
    )
    mountModal('boss@x.test', 'boss@x.test')
    await flushPromises()
    expect(($$('.up-roles input')[0] as HTMLInputElement).disabled).toBe(true)
    expect($('.up-lock')?.textContent).toContain("your own admin rights")
  })

  it('leaves the admin box editable for somebody else', async () => {
    svc.getUserProfile.mockResolvedValue(profile({ roles: ['administrators'], is_admin: true }))
    mountModal()
    await flushPromises()
    expect(($$('.up-roles input')[0] as HTMLInputElement).disabled).toBe(false)
  })

  it('offers no removal at all for your own account', async () => {
    svc.getUserProfile.mockResolvedValue(profile({ uid: 'boss@x.test' }))
    mountModal('boss@x.test', 'boss@x.test')
    await flushPromises()
    expect($('.up-danger-zone')?.textContent).toContain('cannot remove your own account')
    expect($$('.up-danger')).toHaveLength(0)
  })

  it('removes from the tenant only after the confirmation is accepted', async () => {
    svc.removeUser.mockResolvedValue({
      uid: 'ann@x.test', roles_removed: ['editors'], credentials_purged: 2,
    })
    const w = mountModal()
    await flushPromises()
    $$('.up-danger')[0].click()
    await flushPromises()
    expect(svc.removeUser).not.toHaveBeenCalled()          // prompt first
    expect($('.cm-panel')?.textContent).toContain('Their account')
    ;($$('.cm-btn').find((b) => b.textContent?.includes('Remove')) as HTMLElement).click()
    await flushPromises()
    expect(svc.removeUser).toHaveBeenCalledWith('ann@x.test')
    expect(w.emitted('removed')?.[0]).toEqual(['ann@x.test'])
    expect(w.emitted('close')).toBeTruthy()
  })

  it('cancelling the confirmation changes nothing', async () => {
    mountModal()
    await flushPromises()
    $$('.up-danger')[0].click()
    await flushPromises()
    ;($$('.cm-btn').find((b) => b.textContent?.includes('Cancel')) as HTMLElement).click()
    await flushPromises()
    expect(svc.removeUser).not.toHaveBeenCalled()
    expect($('.up-panel')).not.toBeNull()
  })

  it('offers no account-deletion control (that is a sysadmin/LDAP operation)', async () => {
    mountModal()
    await flushPromises()
    // Exactly one danger action: remove from this workspace.
    expect($$('.up-danger')).toHaveLength(1)
    expect($('.up-danger-zone')?.textContent).not.toContain('Delete account')
    expect($('.up-danger-zone')?.textContent).not.toContain('Delete the account entirely')
  })

  it('warns that a removed multi-tenant user keeps access elsewhere', async () => {
    svc.getUserProfile.mockResolvedValue(profile({ other_tenant_count: 2 }))
    mountModal()
    await flushPromises()
    // The removal is still offered — it only unlinks them here — but the admin is
    // told it is not a full offboarding.
    expect(($$('.up-danger')[0] as HTMLButtonElement).disabled).toBe(false)
    expect($('.up-danger-zone')?.textContent).toContain('2 other workspaces')
  })

  it('reports a count of other workspaces in the facts, never their names', async () => {
    svc.getUserProfile.mockResolvedValue(profile({ other_tenant_count: 3 }))
    mountModal()
    await flushPromises()
    expect($('.up-facts')?.textContent).toContain('3')
  })

  it('surfaces a rejected save instead of pretending it worked', async () => {
    svc.setUserRoles.mockRejectedValue(new Error('cannot remove the last administrator'))
    mountModal()
    await flushPromises()
    ;($$('.up-roles input')[2] as HTMLInputElement).click()
    await flushPromises()
    ;($('.up-primary') as HTMLButtonElement).click()
    await flushPromises()
    expect($('.up-err')?.textContent).toContain('last administrator')
    expect($('.up-ok')).toBeNull()
  })

  it('re-sends the invite on request', async () => {
    svc.reinvite.mockResolvedValue(undefined)
    mountModal()
    await flushPromises()
    const btn = $$('.up-btn').find((b) => b.textContent?.includes('Re-send invite'))!
    btn.click()
    await flushPromises()
    expect(svc.reinvite).toHaveBeenCalledWith('ann@x.test')
    expect($('.up-ok')?.textContent).toContain('Invite sent')
  })

  it('closes on Escape, but lets an open confirmation own the key first', async () => {
    const w = mountModal()
    await flushPromises()
    $$('.up-danger')[0].click()
    await flushPromises()
    $('.up-panel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(w.emitted('close')).toBeFalsy()
  })

  it('closes on Escape when nothing else is open', async () => {
    const w = mountModal()
    await flushPromises()
    $('.up-panel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(w.emitted('close')).toBeTruthy()
  })

  it('shows a load failure rather than an empty shell', async () => {
    svc.getUserProfile.mockRejectedValue(new Error('user is not a member of this tenant'))
    mountModal()
    await flushPromises()
    expect($('.up-err')?.textContent).toContain('not a member')
    expect($('.up-roles')).toBeNull()
  })
})

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

const svc = vi.hoisted(() => ({ createUser: vi.fn() }))

vi.mock('@/services/ldapAdminService', async () => {
  const actual = await vi.importActual<object>('@/services/ldapAdminService')
  return { ...actual, ldapAdminService: svc }
})

import InviteUserModal from '@/components/admin/InviteUserModal.vue'

const ROLES = [
  { name: 'administrators', dn: 'cn=administrators', member_count: 1 },
  { name: 'editors', dn: 'cn=editors', member_count: 2 },
]

// Teleport puts the panel on document.body, so assertions read the document.
function mountModal(open = true, roles = ROLES) {
  return mount(InviteUserModal, { props: { open, roles }, attachTo: document.body })
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[]

function field(label: string): HTMLInputElement {
  const found = $$('.iv-field').find((f) => f.textContent?.includes(label))
  return found!.querySelector('input') as HTMLInputElement
}

async function fill(email: string, name: string) {
  const e = field('Email address')
  e.value = email
  e.dispatchEvent(new Event('input'))
  const n = field('Display name')
  n.value = name
  n.dispatchEvent(new Event('input'))
  await flushPromises()
}

const submit = async () => {
  ;($('.iv-panel') as HTMLFormElement).dispatchEvent(new Event('submit'))
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.createUser.mockResolvedValue({ uid: 'new@x.test', email: 'new@x.test', display_name: 'New' })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('InviteUserModal', () => {
  it('renders nothing while closed', () => {
    mountModal(false)
    expect($('.iv-panel')).toBeNull()
  })

  it('offers the tenant roles to pick from', async () => {
    mountModal()
    await flushPromises()
    expect($('.iv-roles')?.textContent).toContain('administrators')
    expect($('.iv-roles')?.textContent).toContain('editors')
  })

  it('cannot be submitted without email, display name, and a role', async () => {
    mountModal()
    await flushPromises()
    expect(($('.iv-primary') as HTMLButtonElement).disabled).toBe(true)
    await fill('new@x.test', '')
    expect(($('.iv-primary') as HTMLButtonElement).disabled).toBe(true)
    await fill('new@x.test', 'New Person')
    // Email + name present but no role yet -> still disabled.
    expect(($('.iv-primary') as HTMLButtonElement).disabled).toBe(true)
    ;($$('.iv-chk input')[1] as HTMLInputElement).click()
    await flushPromises()
    expect(($('.iv-primary') as HTMLButtonElement).disabled).toBe(false)
  })

  it('sends the invite with the roles that were ticked, then closes', async () => {
    const w = mountModal()
    await flushPromises()
    await fill('new@x.test', 'New Person')
    const editors = $$('.iv-chk input')[1] as HTMLInputElement
    editors.click()
    await flushPromises()
    await submit()
    expect(svc.createUser).toHaveBeenCalledWith('new@x.test', 'New Person', ['editors'])
    expect(w.emitted('invited')?.[0]).toEqual(['new@x.test'])
    expect(w.emitted('close')).toBeTruthy()
  })

  it('will not invite without at least one role (membership is holding a role)', async () => {
    mountModal()
    await flushPromises()
    await fill('new@x.test', 'New Person')
    // Email and name filled, but no role -> still blocked.
    expect(($('.iv-primary') as HTMLButtonElement).disabled).toBe(true)
    expect($('.iv-note')?.textContent).toContain('at least one')
    ;($$('.iv-chk input')[1] as HTMLInputElement).click()
    await flushPromises()
    expect(($('.iv-primary') as HTMLButtonElement).disabled).toBe(false)
    expect($('.iv-note')).toBeNull()
  })

  it('stays open with the fields intact when the server refuses', async () => {
    const w = mountModal()
    await flushPromises()
    await fill('taken@x.test', 'Already There')
    ;($$('.iv-chk input')[1] as HTMLInputElement).click()
    await flushPromises()
    svc.createUser.mockRejectedValue(new Error('user already exists; assign them to a role instead'))
    await submit()
    expect($('.iv-err')?.textContent).toContain('already exists')
    expect(w.emitted('close')).toBeFalsy()
    expect(field('Email address').value).toBe('taken@x.test')
  })

  it('starts from a blank form each time it opens', async () => {
    const w = mountModal(false)
    await w.setProps({ open: true })
    await flushPromises()
    await fill('half@x.test', 'Half Typed')
    await w.setProps({ open: false })
    await w.setProps({ open: true })
    await flushPromises()
    expect(field('Email address').value).toBe('')
    expect(field('Display name').value).toBe('')
  })

  it('closes on Cancel and on Escape', async () => {
    const w = mountModal()
    await flushPromises()
    const cancel = $$('.iv-btn').find((b) => b.textContent?.includes('Cancel'))!
    cancel.click()
    await flushPromises()
    expect(w.emitted('close')).toHaveLength(1)
    $('.iv-panel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(w.emitted('close')).toHaveLength(2)
  })

  it('will not be dismissed while the invite is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    svc.createUser.mockReturnValue(new Promise((r) => { release = r }))
    const w = mountModal()
    await flushPromises()
    await fill('new@x.test', 'New Person')
    ;($$('.iv-chk input')[1] as HTMLInputElement).click()
    await flushPromises()
    await submit()
    $$('.iv-btn').find((b) => b.textContent?.includes('Cancel'))!.click()
    await flushPromises()
    expect(w.emitted('close')).toBeFalsy()
    release({ uid: 'new@x.test', email: 'new@x.test', display_name: 'New Person' })
    await flushPromises()
    expect(w.emitted('invited')).toBeTruthy()
  })

  it('blocks entirely when the workspace has no roles to assign', async () => {
    // With no roles there is no way to satisfy the >=1 rule, so inviting is not
    // possible until a role exists.
    mountModal(true, [])
    await flushPromises()
    expect($('.iv-warn')?.textContent).toContain('no roles yet')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { getAcls, grantPermission, revokePermission } = vi.hoisted(() => ({
  getAcls: vi.fn(),
  grantPermission: vi.fn(),
  revokePermission: vi.fn(),
}))

vi.mock('@/services/aclService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/aclService')>()
  return { ...actual, aclService: { getAcls } }
})
vi.mock('@/services/fileService', () => ({
  fileService: { grantPermission, revokePermission },
}))

import AclEditor from '@/components/AclEditor.vue'

// Stub the type-ahead with buttons that emit a chosen principal.
const PrincipalPickerStub = {
  name: 'PrincipalPicker',
  template: `<div>
    <button class="pick" @click="$emit('select', { kind: 'role', value: 'editors' })">pick-role</button>
    <button class="pick-user" @click="$emit('select', { kind: 'user', value: 'alice' })">pick-user</button>
  </div>`,
}

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(AclEditor, {
    props: { uid: 'f1', canManage: true, ...props },
    global: { stubs: { PrincipalPicker: PrincipalPickerStub } },
  })
}

describe('AclEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    grantPermission.mockResolvedValue(undefined)
    revokePermission.mockResolvedValue(undefined)
  })

  it('lists entries with decoded permissions, effect, and the tiered note', async () => {
    getAcls.mockResolvedValue([
      { principal: 'editors', type: 1, permissions: 0x400 | 0x200, effect: 'allow' },
      { principal: 'erin', type: 0, permissions: 0x400, effect: 'deny' },
    ])
    const w = mountEditor()
    await flushPromises()
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('editors')
    expect(w.text()).toContain('Read')
    expect(w.text()).toContain('Write')
    expect(w.text()).toContain('within a group, DENY wins')
  })

  it('orders entries by evaluation tier (user → role/claim → everyone), DENY first in-tier', async () => {
    getAcls.mockResolvedValue([
      { principal: 'everyone', type: 3, permissions: 0x400, effect: 'deny' },
      { principal: 'editors', type: 1, permissions: 0x400, effect: 'allow' },
      { principal: 'alice', type: 0, permissions: 0x400, effect: 'allow' },
      { principal: 'bob', type: 0, permissions: 0x400, effect: 'deny' },
    ])
    const w = mountEditor()
    await flushPromises()
    const names = w.findAll('tbody tr .acl-name').map((n) => n.text())
    expect(names).toEqual(['bob', 'alice', 'editors', 'everyone']) // user(deny,allow) → role → everyone
  })

  it('applies the private-home template: owner full access + everyone DENY read', async () => {
    getAcls.mockResolvedValue([])
    const w = mountEditor()
    await flushPromises()
    await w.find('.pick-user').trigger('click') // user:alice
    await w.findAll('.btn-tpl').find((b) => b.text().includes('Private'))!.trigger('click')
    await flushPromises()
    for (const p of ['r', 'w', 'd']) {
      expect(grantPermission).toHaveBeenCalledWith('f1', { principal: 'alice', permission: p, effect: 'allow' })
    }
    expect(grantPermission).toHaveBeenCalledWith('f1', { principal: 'everyone', permission: 'r', effect: 'deny' })
  })

  it('applies the gated-section template: role read+write + everyone DENY read', async () => {
    getAcls.mockResolvedValue([])
    const w = mountEditor()
    await flushPromises()
    await w.find('.pick').trigger('click') // role:editors
    await w.findAll('.btn-tpl').find((b) => b.text().includes('Gated'))!.trigger('click')
    await flushPromises()
    expect(grantPermission).toHaveBeenCalledWith('f1', { principal: 'role:editors', permission: 'r', effect: 'allow' })
    expect(grantPermission).toHaveBeenCalledWith('f1', { principal: 'role:editors', permission: 'w', effect: 'allow' })
    expect(grantPermission).toHaveBeenCalledWith('f1', { principal: 'everyone', permission: 'r', effect: 'deny' })
  })

  it('grants the picked principal in wire form with the chosen permission/effect', async () => {
    getAcls.mockResolvedValue([])
    const w = mountEditor()
    await flushPromises()
    await w.find('.pick').trigger('click') // PrincipalPicker -> role:editors
    await w.find('.btn').trigger('click') // Grant (defaults perm=r, effect=allow)
    await flushPromises()
    expect(grantPermission).toHaveBeenCalledWith('f1', {
      principal: 'role:editors',
      permission: 'r',
      effect: 'allow',
      recursive: false,
    })
    expect(getAcls).toHaveBeenCalledTimes(2) // reload after grant
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('cascades to child directories when the checkbox is set (directories only)', async () => {
    getAcls.mockResolvedValue([])
    const w = mountEditor({ isDirectory: true })
    await flushPromises()
    await w.find('.pick').trigger('click') // pick role:editors
    await w.find('.acl-recursive input').setValue(true) // "Apply to all child directories"
    await w.find('.acl-add-row .btn').trigger('click') // Grant
    await flushPromises()
    expect(grantPermission).toHaveBeenCalledWith('f1', {
      principal: 'role:editors',
      permission: 'r',
      effect: 'allow',
      recursive: true,
    })
  })

  it('hides the recursive checkbox for a non-directory', async () => {
    getAcls.mockResolvedValue([])
    const w = mountEditor({ isDirectory: false })
    await flushPromises()
    expect(w.find('.acl-recursive').exists()).toBe(false)
  })

  it('grants every checked permission in one action (multi-select)', async () => {
    getAcls.mockResolvedValue([])
    const w = mountEditor()
    await flushPromises()
    await w.find('.pick').trigger('click')
    await w.find('input[value="w"]').setValue(true) // + write ('r' is checked by default)
    await w.find('input[value="d"]').setValue(true) // + delete
    await w.find('.acl-add-row .btn').trigger('click')
    await flushPromises()
    const perms = (grantPermission as any).mock.calls.map((c: any[]) => c[1].permission).sort()
    expect(perms).toEqual(['d', 'r', 'w'])
  })

  it('clears a conflicting opposite rule when adding the other effect', async () => {
    // role:editors already has an explicit ALLOW read.
    getAcls.mockResolvedValue([
      { principal: 'editors', type: 1, permissions: 0x400, effect: 'allow' },
    ])
    const w = mountEditor()
    await flushPromises()
    await w.find('.pick').trigger('click') // role:editors, 'r' checked by default
    await w.find('select[aria-label="Effect"]').setValue('deny')
    await w.find('.acl-add-row .btn').trigger('click')
    await flushPromises()
    // the conflicting allow-read is revoked first, then deny-read granted
    expect(revokePermission).toHaveBeenCalledWith('f1', {
      principal: 'role:editors', permission: 'r', effect: 'allow', recursive: false,
    })
    expect(grantPermission).toHaveBeenCalledWith('f1', {
      principal: 'role:editors', permission: 'r', effect: 'deny', recursive: false,
    })
  })

  it('revokes a single permission using the encoded principal + effect', async () => {
    getAcls.mockResolvedValue([
      { principal: 'dept=eng', type: 4, permissions: 0x400, effect: 'allow' },
    ])
    const w = mountEditor()
    await flushPromises()
    await w.find('.acl-x').trigger('click') // revoke the Read chip
    await flushPromises()
    expect(revokePermission).toHaveBeenCalledWith('f1', {
      principal: 'claim:dept=eng',
      permission: 'r',
      effect: 'allow',
      recursive: false,
    })
  })

  it('hides editing controls when canManage is false', async () => {
    getAcls.mockResolvedValue([{ principal: 'dave', type: 0, permissions: 0x400, effect: 'allow' }])
    const w = mountEditor({ canManage: false })
    await flushPromises()
    expect(w.find('.acl-add').exists()).toBe(false)
    expect(w.find('.acl-x').exists()).toBe(false)
  })
})

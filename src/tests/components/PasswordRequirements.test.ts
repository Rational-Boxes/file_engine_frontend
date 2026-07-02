import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { passwordPolicy } = vi.hoisted(() => ({ passwordPolicy: vi.fn() }))
vi.mock('@/services/ldapAdminService', () => ({ ldapAdminService: { passwordPolicy } }))

import PasswordRequirements from '@/components/PasswordRequirements.vue'

const POLICY = {
  min_length: 8, max_length: 64,
  require_upper: true, require_lower: true, require_digit: true, require_symbol: true,
  min_classes: 0, forbid_identity_substring: true,
}

describe('PasswordRequirements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passwordPolicy.mockResolvedValue(POLICY)
  })

  it('renders a checklist and emits valid=false for a weak password', async () => {
    const w = mount(PasswordRequirements, { props: { password: 'short' } })
    await flushPromises()
    expect(w.findAll('li').length).toBeGreaterThan(0)
    const valid = w.emitted('valid') as boolean[][]
    expect(valid.at(-1)?.[0]).toBe(false)
  })

  it('emits valid=true once every rule is met', async () => {
    const w = mount(PasswordRequirements, { props: { password: 'Str0ng!pw', identity: 'alex@x.com' } })
    await flushPromises()
    await w.setProps({ password: 'Str0ng!password' })
    const valid = w.emitted('valid') as boolean[][]
    expect(valid.at(-1)?.[0]).toBe(true)
  })

  it('flags a password containing the identity local-part', async () => {
    const w = mount(PasswordRequirements, { props: { password: 'Alex!12345', identity: 'alex@x.com' } })
    await flushPromises()
    const idRow = w.findAll('li').find((li) => li.text().includes('name or email'))
    expect(idRow?.classes()).not.toContain('met')
  })
})

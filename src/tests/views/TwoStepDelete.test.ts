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
 * Deletion is two steps, and the second one cannot be undone.
 *
 * Step one is the ordinary soft delete, which Undelete reverses. Step two —
 * "erase permanently" — destroys the content, every version, and everything
 * derived from it across the platform. It is offered ONLY on an item that has
 * already been soft-deleted, and only where the ERASE permission is held, which
 * is never granted by default.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ConfirmModal from '@/components/ConfirmModal.vue'

describe('the erase confirmation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  // ConfirmModal teleports to <body>, so the wrapper's own tree is empty and
  // everything is queried from the document.
  const btn = (label: string) =>
    Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement | undefined
  const field = () => document.body.querySelector('input') as HTMLInputElement | null
  const type = async (v: string) => {
    const el = field()!
    el.value = v
    el.dispatchEvent(new Event('input'))
    await flushPromises()
  }

  const mountModal = (props: Record<string, unknown> = {}) =>
    mount(ConfirmModal, {
      props: {
        open: true,
        title: 'Erase “Contract.pdf” permanently?',
        message: 'This cannot be undone.',
        confirmLabel: 'Erase permanently',
        danger: true,
        ...props,
      },
      attachTo: document.body,
    })

  it('will not fire on a single click for an irreversible action', async () => {
    // A misplaced click on Confirm is a real way to destroy something
    // irreversibly, and the muscle memory for dismissing a dialog is the same
    // gesture. Typing the name cannot happen by accident.
    const w = mountModal({ requireText: 'Contract.pdf' })
    await flushPromises()
    expect(btn('Erase permanently')!.disabled).toBe(true)
    btn('Erase permanently')!.click()
    await flushPromises()
    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('enables only once the exact name is typed', async () => {
    const w = mountModal({ requireText: 'Contract.pdf' })
    await flushPromises()

    await type('Contract')                    // a prefix is not enough
    expect(btn('Erase permanently')!.disabled).toBe(true)

    await type('contract.pdf')                // nor a different case
    expect(btn('Erase permanently')!.disabled).toBe(true)

    await type('Contract.pdf')
    expect(btn('Erase permanently')!.disabled).toBe(false)
    btn('Erase permanently')!.click()
    await flushPromises()
    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('tolerates whitespace from a paste but not a different name', async () => {
    mountModal({ requireText: 'Contract.pdf' })
    await flushPromises()
    await type('  Contract.pdf  ')
    expect(btn('Erase permanently')!.disabled).toBe(false)
  })

  it('leaves an ordinary confirm one click away', async () => {
    // The friction is bought for irreversibility. On a routine confirm it would
    // be cost with nothing to show for it.
    mountModal({ confirmLabel: 'Delete', requireText: undefined })
    await flushPromises()
    expect(field()).toBeNull()
    expect(btn('Delete')!.disabled).toBe(false)
  })

  it('clears the typed value between openings', async () => {
    // A leftover value would let the NEXT irreversible confirm through on one
    // click — the exact protection this exists to provide.
    const w = mountModal({ requireText: 'Contract.pdf' })
    await flushPromises()
    await type('Contract.pdf')
    await w.setProps({ open: false })
    await flushPromises()
    await w.setProps({ open: true })
    await flushPromises()
    expect(btn('Erase permanently')!.disabled).toBe(true)
  })
})

describe('the file store’s erase action', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('reports the erasure as started, not finished, while services are outstanding', async () => {
    // The core's copy is gone, but csai/discussion/difference have yet to
    // confirm destroying what they derived. Reporting "erased" here would be a
    // claim the platform cannot yet stand behind.
    const { useFileStore } = await import('@/stores/files')
    const { fileService } = await import('@/services/fileService')
    vi.spyOn(fileService, 'eraseFile').mockResolvedValue({
      erasure_id: 'e1', state: 'initiated', awaiting: ['csai', 'discussion'],
    })

    const files = useFileStore()
    files.items = [{ uid: 'u1', name: 'Contract.pdf' }] as never
    const erasure = await files.eraseItem({ uid: 'u1', name: 'Contract.pdf' } as never)

    expect(erasure?.state).toBe('initiated')
    expect(erasure?.awaiting).toEqual(['csai', 'discussion'])
    // Gone from the listing regardless: its content is destroyed, so it must not
    // keep appearing as something Undelete could bring back.
    expect(files.items).toHaveLength(0)
  })

  it('keeps the row and reports the error when the erasure is refused', async () => {
    const { useFileStore } = await import('@/stores/files')
    const { fileService } = await import('@/services/fileService')
    vi.spyOn(fileService, 'eraseFile').mockRejectedValue(new Error('denied'))

    const files = useFileStore()
    files.items = [{ uid: 'u1', name: 'Contract.pdf' }] as never
    const erasure = await files.eraseItem({ uid: 'u1', name: 'Contract.pdf' } as never)

    expect(erasure).toBeNull()
    expect(files.items).toHaveLength(1)
    expect(files.error).toBeTruthy()
  })
})

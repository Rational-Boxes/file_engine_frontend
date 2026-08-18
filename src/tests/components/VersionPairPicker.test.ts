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

const { listVersionDetails } = vi.hoisted(() => ({ listVersionDetails: vi.fn() }))

vi.mock('@/services/fileService', () => ({ fileService: { listVersionDetails } }))
vi.mock('@/services/apiClient', () => ({ errorMessage: (_e: unknown, m: string) => m }))

import VersionPairPicker from '@/components/VersionPairPicker.vue'

// Newest-first, matching the core's own ordering — the whole "before must be
// older" constraint below depends on that direction being right.
const V = ['2026-08-17T10:00:00', '2026-08-16T09:00:00', '2026-08-15T08:00:00']

beforeEach(() => {
  listVersionDetails.mockReset()
  // The picker now asks for uploaders too; `revised_by` is what the menus append.
  listVersionDetails.mockResolvedValue(V.map((version) => ({ version, revised_by: '' })))
})

async function picker(props: Record<string, unknown> = {}) {
  const w = mount(VersionPairPicker, { props: { uid: 'f1', ...props } })
  await flushPromises()
  return w
}

describe('defaults', () => {
  it('opens on the newest pair, which is what the service would pick anyway', async () => {
    const w = await picker()
    const sels = w.findAll('select')
    expect((sels[1].element as HTMLSelectElement).value).toBe(V[0]) // after
    expect((sels[0].element as HTMLSelectElement).value).toBe(V[1]) // before
  })

  it('shows the pair the caller is already displaying', async () => {
    const w = await picker({ base: V[2], target: V[1] })
    const sels = w.findAll('select')
    expect((sels[0].element as HTMLSelectElement).value).toBe(V[2])
    expect((sels[1].element as HTMLSelectElement).value).toBe(V[1])
  })
})

describe('the pair stays comparable', () => {
  it('only offers versions older than the target as the base', async () => {
    const w = await picker()
    const before = w.findAll('select')[0]
    // Target is the newest, so both older versions are offerable and the newest
    // itself is not — comparing a version with itself is not a comparison.
    const opts = before.findAll('option').map((o) => o.element.value)
    expect(opts).toEqual([V[1], V[2]])
  })

  it('moves the base down when the target is changed to something older', async () => {
    const w = await picker({ base: V[1], target: V[0] })
    const sels = w.findAll('select')
    await sels[1].setValue(V[1]) // after := the middle version
    await flushPromises()
    // V[1] can no longer be the base — it is now the target. Silently comparing
    // a version against itself would be worse than moving the other end.
    expect((sels[0].element as HTMLSelectElement).value).toBe(V[2])
  })

  it('will not emit a comparison of a version with itself', async () => {
    const w = await picker()
    const sels = w.findAll('select')
    await sels[0].setValue(V[0])
    await flushPromises()
    expect(w.emitted('compare')).toBeUndefined()
  })
})

describe('emitting', () => {
  it('emits the chosen pair', async () => {
    const w = await picker({ base: V[2], target: V[0] })
    await w.get('.vp-go').trigger('click')
    expect(w.emitted('compare')?.[0]).toEqual([{ base: V[2], target: V[0] }])
  })

  it('disables itself and says so while the caller is comparing', async () => {
    const w = await picker({ busy: true })
    expect(w.get('.vp-go').text()).toContain('Comparing')
    expect((w.get('.vp-go').element as HTMLButtonElement).disabled).toBe(true)
    expect(w.findAll('select').every((s) => (s.element as HTMLSelectElement).disabled)).toBe(true)
  })
})

describe('failure', () => {
  it('reports a version list it could not load rather than showing an empty menu', async () => {
    listVersionDetails.mockRejectedValueOnce(new Error('boom'))
    const w = await picker()
    expect(w.get('.vp-err').text()).toBe('Failed to load the version list')
  })
})


describe('who uploaded each version', () => {
  it('names the uploader beside the timestamp', async () => {
    // On a shared document "which version" is usually really a question about
    // who changed it, so the menus say both.
    listVersionDetails.mockResolvedValue([
      { version: V[0], revised_by: 'ana@example.com' },
      { version: V[1], revised_by: 'bo@example.com' },
      { version: V[2], revised_by: '' },
    ])
    const w = await picker()
    const labels = w.findAll('option').map((o) => o.text())
    expect(labels.some((t) => t.includes('ana@example.com'))).toBe(true)
    expect(labels.some((t) => t.includes('bo@example.com'))).toBe(true)
    // A version the core has no uploader for shows the timestamp alone rather
    // than a dangling separator.
    const bare = labels.find((t) => t.startsWith('2026-08-15'))
    expect(bare).toBe('2026-08-15 08:00:00')
  })
})

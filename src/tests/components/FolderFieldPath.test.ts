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
 * The reported bug: "Move on Review" showed folder UUIDs instead of paths.
 *
 * The label was only ever set by the picker, so it existed for a folder chosen
 * in that session and was gone on reload — which is the normal case, since you
 * open an existing binding far more often than you create one.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { stat } = vi.hoisted(() => ({ stat: vi.fn() }))
vi.mock('@/services/fileService', () => ({ fileService: { stat } }))
vi.mock('@/services/folderActionsService', () => ({ folderActionsService: {} }))

import FieldRenderer from '@/components/FieldRenderer.vue'
import { forgetFolderPaths } from '@/utils/folderPath'

const ROOT = '00000000-0000-0000-0000-000000000000'
const APPROVED = '11111111-2222-3333-4444-555555555555'
const REJECTED = '66666666-2222-3333-4444-555555555555'

const TREE: Record<string, { name: string; parent_uid: string }> = {
  [APPROVED]: { name: 'Approved', parent_uid: ROOT },
  [REJECTED]: { name: 'Rejected', parent_uid: ROOT },
}

// The real fields from the move-on-review plugin.
const FIELDS = [
  { key: 'on_approved', label: 'Move approved to', type: 'folder' },
  { key: 'on_rejected', label: 'Move rejected to', type: 'folder' },
]

beforeEach(() => {
  setActivePinia(createPinia())
  forgetFolderPaths()
  stat.mockReset()
  stat.mockImplementation(async (uid: string) => {
    const n = TREE[uid]
    if (!n) throw new Error('not found')
    return { uid, name: n.name, parent_uid: n.parent_uid, type: 'directory' }
  })
})

function render(model: Record<string, unknown>) {
  return mount(FieldRenderer, {
    props: { fields: FIELDS as never, modelValue: model },
    global: { stubs: { NodeBrowser: true, PrincipalPicker: true, Teleport: true } },
  })
}

const boxes = (w: ReturnType<typeof render>) =>
  w.findAll('.fr-folder-txt').map((i) => (i.element as HTMLInputElement).value)

describe('a stored folder field shows its path', () => {
  it('resolves both destinations of Move on Review', async () => {
    const w = render({ on_approved: APPROVED, on_rejected: REJECTED })
    await flushPromises()
    expect(boxes(w)).toEqual(['/Approved', '/Rejected'])
  })

  it('shows the uid rather than nothing when the folder is unreachable', async () => {
    // Deleted or invisible. An empty box would read as "not configured".
    const gone = '99999999-2222-3333-4444-555555555555'
    const w = render({ on_approved: gone })
    await flushPromises()
    expect(boxes(w)[0]).toBe(gone)
  })

  it('leaves an unset field empty', async () => {
    const w = render({})
    await flushPromises()
    expect(boxes(w)[0]).toBe('')
  })

  it('does not display a bare uuid once resolution has settled', async () => {
    // The symptom itself, stated directly.
    const w = render({ on_approved: APPROVED, on_rejected: REJECTED })
    await flushPromises()
    for (const v of boxes(w)) {
      expect(v).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)
    }
  })
})

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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

const { checkPermission } = vi.hoisted(() => ({ checkPermission: vi.fn() }))
vi.mock('@/services/fileService', () => ({ fileService: { checkPermission } }))

import { useOfficeEditing } from '@/composables/useOfficeEditing'

const settle = async () => {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('useOfficeEditing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers editing for an office document the user can write', async () => {
    checkPermission.mockResolvedValue(true)
    const { canEdit } = useOfficeEditing(ref('f1'), ref('report.docx'))
    await settle()
    expect(canEdit.value).toBe(true)
    expect(checkPermission).toHaveBeenCalledWith('f1', { permission: 'w' })
  })

  it('does NOT offer it without write — the editor would answer 403', async () => {
    // The bug this exists to fix: read-only users were shown the button and met
    // "you do not have permission to edit this file".
    checkPermission.mockResolvedValue(false)
    const { canEdit } = useOfficeEditing(ref('f1'), ref('report.docx'))
    await settle()
    expect(canEdit.value).toBe(false)
  })

  it('does not ask about permission for a file the editor cannot open', async () => {
    const { canEdit } = useOfficeEditing(ref('f1'), ref('archive.zip'))
    await settle()
    expect(canEdit.value).toBe(false)
    expect(checkPermission).not.toHaveBeenCalled()
  })

  it('fails closed when the permission question cannot be answered', async () => {
    // A hidden button on an editable file is a smaller harm than a button that
    // greets the user with an access error.
    checkPermission.mockRejectedValue(new Error('offline'))
    const { canEdit } = useOfficeEditing(ref('f1'), ref('report.docx'))
    await settle()
    expect(canEdit.value).toBe(false)
  })

  it('re-answers when the file changes, and withdraws the offer', async () => {
    // The overlay is reused for the next document rather than remounted, so a
    // stale `true` would carry the button onto a file the user cannot edit.
    checkPermission.mockResolvedValue(true)
    const uid = ref('f1')
    const name = ref('report.docx')
    const { canEdit } = useOfficeEditing(uid, name)
    await settle()
    expect(canEdit.value).toBe(true)

    checkPermission.mockResolvedValue(false)
    uid.value = 'f2'
    name.value = 'other.docx'
    await settle()
    expect(canEdit.value).toBe(false)
  })
})

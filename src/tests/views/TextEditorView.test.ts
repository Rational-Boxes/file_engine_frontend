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
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn(),
  stat: vi.fn(),
  back: vi.fn(),
  leaveGuard: undefined as undefined | (() => boolean),
}))

vi.mock('@/services/fileService', () => ({
  fileService: { readText: h.readText, writeText: h.writeText, stat: h.stat },
}))
vi.mock('@/services/apiClient', () => ({
  errorMessage: (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { uid: 'u1' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: h.back }),
  onBeforeRouteLeave: (fn: () => boolean) => { h.leaveGuard = fn },
}))

import TextEditorView from '@/views/TextEditorView.vue'

const REPLACEMENT = String.fromCharCode(0xfffd)

const mountEditor = async () => {
  const w = mount(TextEditorView)
  await flushPromises()
  return w
}

describe('TextEditorView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.stat.mockResolvedValue({ name: 'config.yaml' })
    h.readText.mockResolvedValue('key: value\n')
    h.writeText.mockResolvedValue(undefined)
    h.leaveGuard = undefined
  })

  it('loads the file and shows its text', async () => {
    const w = await mountEditor()
    expect(h.readText).toHaveBeenCalledWith('u1')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('key: value\n')
    expect(w.text()).toContain('config.yaml')
  })

  it('saves edited text back as a new version', async () => {
    const w = await mountEditor()
    await w.find('textarea').setValue('key: changed\n')
    await w.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(h.writeText).toHaveBeenCalledWith('u1', 'key: changed\n')
    expect(w.text()).toContain('Saved as a new version')
  })

  it('cannot save when nothing has changed', async () => {
    const w = await mountEditor()
    expect((w.find('.btn-primary').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps edits made DURING a save from being marked saved', async () => {
    // The box is compared against what was SENT, not against itself: a keystroke
    // landing mid-request would otherwise be treated as saved and then lost.
    let release: (v?: unknown) => void = () => {}
    h.writeText.mockReturnValue(new Promise((r) => { release = r }))
    const w = await mountEditor()
    await w.find('textarea').setValue('first\n')
    await w.find('.btn-primary').trigger('click')
    await w.find('textarea').setValue('first then more\n')
    release()
    await flushPromises()
    expect((w.find('.btn-primary').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('reports a failed save instead of claiming success', async () => {
    h.writeText.mockRejectedValue(new Error('denied'))
    const w = await mountEditor()
    await w.find('textarea').setValue('x')
    await w.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('denied')
    expect(w.text()).not.toContain('Saved as a new version')
  })

  it('refuses to edit bytes that are not valid UTF-8', async () => {
    // Saving would write the replacement character over whatever could not be
    // decoded, so the editor declines instead of corrupting the file.
    h.readText.mockResolvedValue('PK' + REPLACEMENT + REPLACEMENT + ' binary')
    const w = await mountEditor()
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.text()).toContain('not valid UTF-8')
  })

  it('surfaces a load failure', async () => {
    h.readText.mockRejectedValue(new Error('not found'))
    const w = await mountEditor()
    expect(w.text()).toContain('not found')
    expect(w.find('textarea').exists()).toBe(false)
  })

  it('still opens when stat fails, because the content is what matters', async () => {
    h.stat.mockRejectedValue(new Error('stat down'))
    const w = await mountEditor()
    expect(w.find('textarea').exists()).toBe(true)
    expect(w.text()).toContain('u1')
  })

  it('warns before leaving with unsaved changes, and not otherwise', async () => {
    const w = await mountEditor()
    expect(h.leaveGuard!()).toBe(true) // clean: no prompt
    await w.find('textarea').setValue('dirty')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    expect(h.leaveGuard!()).toBe(false)
    expect(confirm).toHaveBeenCalled()
  })
})

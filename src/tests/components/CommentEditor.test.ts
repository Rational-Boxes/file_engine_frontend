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

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CommentEditor from '@/components/CommentEditor.vue'


describe('CommentEditor', () => {
  it('bold wraps the current selection in **…**', async () => {
    const w = mount(CommentEditor, { props: { modelValue: 'hello' } })
    const ta = w.find('textarea').element as HTMLTextAreaElement
    ta.setSelectionRange(0, 5)
    await w.find('button[title^="Bold"]').trigger('click')
    const emits = w.emitted('update:modelValue')!
    expect(emits[emits.length - 1][0]).toBe('**hello**')
  })

  it('list button prefixes the line', async () => {
    const w = mount(CommentEditor, { props: { modelValue: 'item' } })
    const ta = w.find('textarea').element as HTMLTextAreaElement
    ta.setSelectionRange(0, 4)
    await w.find('button[title="Bulleted list"]').trigger('click')
    const emits = w.emitted('update:modelValue')!
    expect(emits[emits.length - 1][0]).toBe('- item')
  })

  it('link inserts a markdown link around the selection', async () => {
    const w = mount(CommentEditor, { props: { modelValue: 'docs' } })
    const ta = w.find('textarea').element as HTMLTextAreaElement
    ta.setSelectionRange(0, 4)
    await w.find('button[title="Link"]').trigger('click')
    const emits = w.emitted('update:modelValue')!
    expect(emits[emits.length - 1][0]).toBe('[docs](https://)')
  })

  it('submit emits only when non-empty', async () => {
    const empty = mount(CommentEditor, { props: { modelValue: '   ' } })
    await empty.find('.ce-submit').trigger('click')
    expect(empty.emitted('submit')).toBeUndefined()

    const filled = mount(CommentEditor, { props: { modelValue: 'hi' } })
    await filled.find('.ce-submit').trigger('click')
    expect(filled.emitted('submit')).toHaveLength(1)
  })

  // Regression: PDF.js's annotation-editor UIManager installs GLOBAL keydown +
  // copy/cut/paste listeners that hijack Backspace/Delete/Cut for a <textarea>
  // (it only exempts <input type=text|number>). The composer must stop these
  // events from bubbling to window/document, or editing a comment while a PDF
  // markup is selected deletes the markup and eats the keystroke.
  it('stops key/clipboard events from reaching global editor listeners', () => {
    const w = mount(CommentEditor, { props: { modelValue: 'hi' }, attachTo: document.body })
    const ta = w.find('textarea').element
    const seen: string[] = []
    const record = (e: Event) => seen.push(e.type)
    for (const type of ['keydown', 'keyup', 'copy', 'cut', 'paste']) {
      window.addEventListener(type, record)
    }
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true }))
    for (const type of ['copy', 'cut', 'paste']) {
      ta.dispatchEvent(new Event(type, { bubbles: true }))
    }
    for (const type of ['keydown', 'keyup', 'copy', 'cut', 'paste']) {
      window.removeEventListener(type, record)
    }
    w.unmount()
    // None of the composer's events reached window (all stopped at the textarea).
    expect(seen).toEqual([])
  })
})

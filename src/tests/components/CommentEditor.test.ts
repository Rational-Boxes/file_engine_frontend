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
})

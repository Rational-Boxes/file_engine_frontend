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
import { isEditableText, textFileExtension } from '@/utils/textFile'

describe('isEditableText', () => {
  it('accepts the everyday text kinds', () => {
    for (const n of ['notes.txt', 'README.md', 'config.yaml', 'values.yml', 'page.html'])
      expect(isEditableText(n)).toBe(true)
  })

  it('accepts structured data that is text to edit even where its MIME is not text/*', () => {
    // .json and .xml are application/* by IANA registration and unmistakably
    // text in practice — the list follows what a person would edit, not the
    // registry.
    for (const n of ['package.json', 'pom.xml', 'settings.toml', 'data.csv'])
      expect(isEditableText(n)).toBe(true)
  })

  it('accepts source files', () => {
    for (const n of ['main.py', 'App.vue', 'index.ts', 'build.sh', 'query.sql'])
      expect(isEditableText(n)).toBe(true)
  })

  it('refuses containers that a text round trip would corrupt', () => {
    for (const n of ['report.docx', 'book.pdf', 'sheet.xlsx', 'photo.png', 'archive.zip'])
      expect(isEditableText(n)).toBe(false)
  })

  it('refuses a name with no extension rather than guessing', () => {
    // LICENSE and Makefile are very likely text, but guessing wrong opens binary
    // bytes in a textarea and offers to save them back — a data-loss shape.
    for (const n of ['LICENSE', 'Makefile', 'Dockerfile', ''])
      expect(isEditableText(n)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isEditableText('NOTES.TXT')).toBe(true)
    expect(isEditableText('Config.YAML')).toBe(true)
  })

  it('reads the LAST extension of a multi-dotted name', () => {
    expect(isEditableText('archive.tar.gz')).toBe(false)
    expect(isEditableText('values.prod.yaml')).toBe(true)
    expect(textFileExtension('values.prod.yaml')).toBe('yaml')
  })

  it('does not treat a dotfile as an extension', () => {
    expect(textFileExtension('.env')).toBe('')
  })
})

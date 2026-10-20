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
import { fileKind, fileIcon, isOpaqueBinary, conversionOffer, extensionOf } from '@/utils/fileKind'

const KNOWN = { known: true, previewExtensions: ['docx', 'pdf', 'png', 'city.json', 'ifc'] }
const UNKNOWN = { known: false, previewExtensions: [] }

describe('fileKind', () => {
  it('classifies opaque binaries by extension', () => {
    expect(fileKind('setup.exe')).toBe('executable')
    expect(fileKind('backup.tar.gz')).toBe('archive')
    expect(fileKind('ubuntu.iso')).toBe('disk-image')
    expect(fileKind('libfoo.so')).toBe('library')
    expect(fileKind('app.db')).toBe('database')
    expect(fileKind('Inter.woff2')).toBe('font')
    for (const n of ['setup.exe', 'backup.zip', 'disk.dmg', 'mod.pyc', 'x.wasm', 'f.ttf'])
      expect(isOpaqueBinary(fileKind(n))).toBe(true)
  })

  it('treats .obj as a 3D mesh, not an object file', () => {
    expect(fileKind('part.obj')).toBe('model')
    expect(fileIcon('tower.ifc')).toBe('🏗️')
  })

  it('folders, documents and unknowns', () => {
    expect(fileKind('docs', true)).toBe('folder')
    expect(fileIcon('docs', true)).toBe('📁')
    expect(fileKind('report.docx')).toBe('document')
    expect(fileKind('README')).toBe('file')
    expect(fileIcon('README')).toBe('📄')
    expect(fileIcon('setup.exe')).toBe('⚙️')
  })

  it('a leading dot is a name, not an extension', () => {
    expect(extensionOf('.bashrc')).toBe('')
    expect(extensionOf('a.TXT')).toBe('txt')
  })
})

describe('conversionOffer', () => {
  it('offers what the deployment reports it can render', () => {
    expect(conversionOffer('Report.DOCX', KNOWN)).toBe('offer')
    expect(conversionOffer('site.city.json', KNOWN)).toBe('offer')
  })

  it('withholds what nothing installed renders', () => {
    expect(conversionOffer('notes.txt', KNOWN)).toBe('none')
    expect(conversionOffer('data.json', KNOWN)).toBe('none') // .json is not city.json
  })

  it('never offers an opaque binary, known deployment or not', () => {
    expect(conversionOffer('setup.exe', KNOWN)).toBe('none')
    expect(conversionOffer('setup.exe', UNKNOWN)).toBe('none')
    // Even if a server-side name lookup claimed it.
    expect(conversionOffer('libc.a', { known: true, previewExtensions: ['a'] })).toBe('none')
  })

  it('is unknown, not none, when the deployment has not said', () => {
    expect(conversionOffer('notes.txt', UNKNOWN)).toBe('unknown')
  })
})

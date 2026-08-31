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
import {
  previewVerdictFromRow,
  canPreviewWithRenditions,
  canView3DModel,
  type PreviewCandidate,
} from '@/utils/previewable'
import type { RenditionSet } from '@/services/renditions'

const file = (over: Partial<PreviewCandidate> = {}): PreviewCandidate => ({
  name: 'report.docx',
  isDirectory: false,
  deleted: false,
  hasRenditions: false,
  ...over,
})

// Renditions are named "<version>-<fmt>.<ext>"; only the ext matters here.
const ref = (fmt: string, ext: string) => ({
  uid: `r-${fmt}`,
  name: `20260101_000000.000-${fmt}.${ext}`,
  fmt,
  ext,
  version: '20260101_000000.000',
})
const set = (o: Record<string, unknown> = {}) => o as RenditionSet

describe('previewVerdictFromRow — what the row alone can settle', () => {
  it('says yes to a PDF without looking anything up', () => {
    // The viewer reads the file itself, so a freshly uploaded PDF previews
    // before anything has converted it. 15 of 39 PDFs on the reference
    // deployment have no preview rendition at all.
    expect(previewVerdictFromRow(file({ name: 'contract.pdf' }))).toBe('yes')
    expect(previewVerdictFromRow(file({ name: 'SCAN.PDF' }))).toBe('yes')
  })

  it('says yes to any image a browser renders inline', () => {
    for (const n of ['photo.jpg', 'x.JPEG', 'a.png', 'b.gif', 'c.webp', 'd.avif', 'e.svg', 'f.jfif', 'g.bmp'])
      expect(previewVerdictFromRow(file({ name: n }))).toBe('yes')
  })

  it('does not treat a format browsers will not display as an image', () => {
    // These need a generated preview like any other document.
    for (const n of ['scan.tiff', 'art.psd', 'shot.heic'])
      expect(previewVerdictFromRow(file({ name: n }))).toBe('no')
  })

  it('does not mistake an extension appearing mid-name', () => {
    expect(previewVerdictFromRow(file({ name: 'pdf-notes.txt' }))).toBe('no')
    expect(previewVerdictFromRow(file({ name: 'about.pdf.zip' }))).toBe('no')
  })

  it('says no when nothing has been generated and the file cannot show itself', () => {
    expect(previewVerdictFromRow(file({ name: 'part.step' }))).toBe('no')
    expect(previewVerdictFromRow(file({ name: 'archive.zip' }))).toBe('no')
  })

  it('defers to the rendition set when renditions exist', () => {
    // Which one it has decides the answer, and the row carries only a count.
    expect(previewVerdictFromRow(file({ name: 'part.step', hasRenditions: true }))).toBe('ask')
    expect(previewVerdictFromRow(file({ name: 'deck.pptx', hasRenditions: true }))).toBe('ask')
  })

  it('never previews a directory or a soft-deleted row', () => {
    expect(previewVerdictFromRow(file({ name: 'reports.pdf', isDirectory: true }))).toBe('no')
    expect(previewVerdictFromRow(file({ name: 'gone.pdf', deleted: true }))).toBe('no')
    expect(previewVerdictFromRow(file({ name: 'gone.docx', deleted: true, hasRenditions: true }))).toBe('no')
  })
})

describe('canPreviewWithRenditions — the full rule', () => {
  it('previews an office document through its pdf rendition', () => {
    expect(canPreviewWithRenditions('deck.pptx', set({ pdf: ref('pdf', 'pdf') }))).toBe(true)
  })

  it('previews a 3D model through the xkt, and not without it', () => {
    // A converted .step IS previewable — the model viewer loads the geometry,
    // not the source. An unconverted one has nothing to load.
    expect(canPreviewWithRenditions('part.step', set({ model: ref('model', 'xkt') }))).toBe(true)
    expect(canPreviewWithRenditions('house.ifc', set({ model: ref('model', 'xkt') }))).toBe(true)
    expect(canPreviewWithRenditions('house.ifc', set({ metamodel: ref('metamodel', 'json') }))).toBe(false)
  })

  it('previews a video through a playable preview clip', () => {
    expect(canPreviewWithRenditions('clip.mov', set({ preview: ref('preview', 'webm') }))).toBe(true)
    expect(canPreviewWithRenditions('clip.mov', set({ preview: ref('preview', 'mp4') }))).toBe(true)
  })

  it('does not count a poster frame on its own as a video preview', () => {
    // The poster is the still; without the clip there is nothing to play.
    expect(canPreviewWithRenditions('clip.mov', set({ poster: ref('poster', 'png') }))).toBe(false)
  })

  it('counts a still preview only when the browser can display it', () => {
    // The point: a preview rendition EXISTING is not a promise that it is a
    // browser-known image format.
    expect(canPreviewWithRenditions('notes.md', set({ preview: ref('preview', 'png') }))).toBe(true)
    expect(canPreviewWithRenditions('notes.md', set({ preview: ref('preview', 'tiff') }))).toBe(false)
    expect(canPreviewWithRenditions('notes.md', set({ preview: ref('preview', 'bin') }))).toBe(false)
  })

  it('ignores renditions that are not display surfaces', () => {
    expect(canPreviewWithRenditions('x.docx', set({ markup: ref('markup', 'json') }))).toBe(false)
    expect(canPreviewWithRenditions('x.docx', set({ thumbnail: ref('thumbnail', 'png') }))).toBe(false)
  })

  it('previews a PDF or inline image whatever the set holds', () => {
    expect(canPreviewWithRenditions('a.pdf', set())).toBe(true)
    expect(canPreviewWithRenditions('a.png', set())).toBe(true)
  })

  it('says no for an empty set on a file that cannot show itself', () => {
    expect(canPreviewWithRenditions('part.step', set())).toBe(false)
  })
})

describe('canView3DModel', () => {
  it('accepts a recognised model that has been converted', () => {
    expect(canView3DModel(file({ name: 'plant.ifc', hasRenditions: true }))).toBe(true)
  })

  it('rejects an unconverted model, a non-model, and a directory', () => {
    expect(canView3DModel(file({ name: 'plant.ifc' }))).toBe(false)
    expect(canView3DModel(file({ name: 'notes.pdf', hasRenditions: true }))).toBe(false)
    expect(canView3DModel(file({ name: 'models.ifc', isDirectory: true, hasRenditions: true }))).toBe(false)
  })
})

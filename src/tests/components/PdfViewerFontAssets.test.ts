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

// Regression guard for the macOS-only garbled-text bug.
//
// pdfjs defaults `useSystemFonts` to true in a browser, and in that mode it
// deliberately skips its own bundled Liberation/Foxit substitutes and resolves
// non-embedded fonts through CSS `local(<name>)` against the host OS instead
// (pdfjs-dist/build/pdf.worker.mjs, ExpressionEvaluator#fetchStandardFontData:
// `if (this.options.useSystemFonts && name !== "Symbol" && name !== "ZapfDingbats")
// return null`). The substitution CSS it then hands to the canvas leads with the
// PDF's own family name, so the OS picks the face. macOS matches names Windows
// and Linux do not, and a symbol-encoded match renders dingbats and Greek where
// letters belong — because pdfjs has already re-encoded the char codes through
// SymbolSetEncoding / ZapfDingbatsEncoding / the U+F000-F0FF symbolic range.
//
// The bug is invisible on a Linux CI box by construction: it IS the absence of
// those fonts locally. So there is nothing to assert about rendered pixels here.
// What is assertable — and what actually regressed — is the contract: the viewer
// must pin every runtime data directory and opt out of OS font matching, and the
// build must actually ship the files those URLs point at.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const h = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {} as { workerSrc?: string },
}))

h.getDocument.mockImplementation(() => ({
  promise: Promise.resolve({ numPages: 1, annotationStorage: {} }),
  destroy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('pdfjs-dist', () => ({
  getDocument: h.getDocument,
  GlobalWorkerOptions: h.GlobalWorkerOptions,
  AnnotationEditorType: { NONE: 0, HIGHLIGHT: 9, FREETEXT: 3, INK: 15, STAMP: 13, SIGNATURE: 101 },
}))

// Minimal doubles for the prebuilt viewer components buildViewer() constructs.
vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({
  EventBus: class { on() {} off() {} dispatch() {} },
  PDFLinkService: class { setViewer() {} setDocument() {} },
  PDFViewer: class { setDocument() {} currentScale = 1; currentScaleValue = '' },
  GenericL10n: class {},
}))
vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({ default: '/worker.mjs' }))
vi.mock('pdfjs-dist/web/pdf_viewer.css', () => ({}))

import PdfViewer from '@/components/PdfViewer.vue'

const root = resolve(__dirname, '../../..')

// jsdom gives no layout, so the viewer's container refs measure as 0x0. That is
// fine: loadDoc() calls getDocument() regardless, which is all this asserts.
async function mountAndLoad() {
  const w = mount(PdfViewer, { props: { src: 'blob:fake-pdf' } })
  await flushPromises()
  await flushPromises()
  return w
}

describe('PdfViewer runtime font/data assets', () => {
  beforeEach(() => h.getDocument.mockClear())
  afterAll(() => vi.unstubAllGlobals())

  it('opts out of OS font matching so rendering is identical on every platform', async () => {
    await mountAndLoad()

    expect(h.getDocument).toHaveBeenCalledTimes(1)
    const opts = h.getDocument.mock.calls[0][0]

    // The actual macOS fix. If this flips back to true (or is dropped, which is
    // the same thing — it defaults to true in a browser), non-embedded fonts go
    // back to OS `local()` matching and Mac users get symbols for letters again.
    expect(opts.useSystemFonts).toBe(false)
  })

  it('pins every pdfjs runtime data directory', async () => {
    await mountAndLoad()
    const opts = h.getDocument.mock.calls[0][0]

    expect(opts).toMatchObject({
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      iccUrl: '/pdfjs/iccs/',
      wasmUrl: '/pdfjs/wasm/',
    })
  })

  it('gives every data URL a trailing slash', async () => {
    await mountAndLoad()
    const opts = h.getDocument.mock.calls[0][0]

    // pdfjs concatenates the filename straight on:
    //   `${this.options.standardFontDataUrl}${filename}`
    // A missing slash yields ".../standard_fontsLiberationSans-Regular.ttf" — a
    // 404 that degrades silently back into OS font matching.
    for (const key of ['standardFontDataUrl', 'cMapUrl', 'iccUrl', 'wasmUrl'] as const) {
      expect(opts[key], `${key} must end in '/'`).toMatch(/\/$/)
    }
  })

  it('honours a non-root Vite base so a subpath deploy still finds the assets', async () => {
    await mountAndLoad()
    const opts = h.getDocument.mock.calls[0][0]

    // BASE_URL is '/' under test; the assertion that matters is that the URLs are
    // derived from it rather than hardcoded, so a future `base` change carries.
    const base = import.meta.env.BASE_URL
    expect(opts.standardFontDataUrl.startsWith(base)).toBe(true)
    expect(opts.cMapUrl.startsWith(base)).toBe(true)
  })
})

describe('staged pdfjs assets', () => {
  // The URLs above are only as good as the files behind them. scripts/copy-pdfjs-assets.mjs
  // runs from predev/prebuild; if it stops working, the viewer 404s and silently
  // falls back to exactly the broken behaviour this branch fixes.
  const staged = resolve(root, 'public/pdfjs')

  it.runIf(existsSync(staged))('stages the files the getDocument URLs point at', () => {
    const fonts = readdirSync(resolve(staged, 'standard_fonts'))
    // The two pdfjs fetches even when useSystemFonts is true, plus the substitutes
    // it uses when it is false.
    expect(fonts).toContain('FoxitSymbol.pfb')
    expect(fonts).toContain('FoxitDingbats.pfb')
    expect(fonts).toContain('LiberationSans-Regular.ttf')

    // CJK / Identity-H documents need these; they were never shipped before.
    expect(readdirSync(resolve(staged, 'cmaps')).length).toBeGreaterThan(100)

    for (const dir of ['iccs', 'wasm']) {
      expect(readdirSync(resolve(staged, dir)).length).toBeGreaterThan(0)
    }
  })

  it('copies from the installed pdfjs-dist, so the versions cannot drift', () => {
    const pkg = resolve(root, 'node_modules/pdfjs-dist')
    for (const dir of ['standard_fonts', 'cmaps', 'iccs', 'wasm']) {
      expect(existsSync(resolve(pkg, dir)), `pdfjs-dist ships ${dir}`).toBe(true)
    }
  })
})

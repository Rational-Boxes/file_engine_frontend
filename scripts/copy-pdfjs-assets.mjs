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

// Stage pdfjs-dist's runtime data files into public/ so Vite serves them in dev
// and copies them into dist/ on build. These are plain data directories, not
// modules, so there is nothing for Vite to resolve through an import — without
// this step they simply never ship, and PdfViewer's getDocument() options would
// point at 404s.
//
// Why each one matters (see PdfViewer.vue for the matching getDocument opts):
//   standard_fonts  Liberation/Foxit substitutes for non-embedded fonts. Absent,
//                   pdfjs falls back to OS `local()` name matching, which makes
//                   rendering platform-dependent — macOS resolves font names
//                   Windows and Linux do not, and symbol-encoded matches render
//                   dingbats where letters belong.
//   cmaps           character maps for non-embedded CID fonts (CJK, Identity-H).
//   iccs            ICC profiles for colour-managed PDFs.
//   wasm            JPEG2000 / JBIG2 image decoders (pdfjs 6 moved these to wasm).
//
// Run from `predev` and `prebuild`; public/pdfjs/ is gitignored build output.

import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = resolve(root, 'node_modules/pdfjs-dist')
const to = resolve(root, 'public/pdfjs')

rmSync(to, { recursive: true, force: true })
mkdirSync(to, { recursive: true })

for (const dir of ['standard_fonts', 'cmaps', 'iccs', 'wasm']) {
  cpSync(resolve(from, dir), resolve(to, dir), { recursive: true })
}

console.log(`pdfjs assets staged -> ${to}`)

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

// pdfjs-dist ships types for its main API (`pdfjs-dist`) but not for the prebuilt
// viewer components subpath, and its package.json has no `exports` map — so under
// `moduleResolution: bundler` TS cannot find a declaration for it. Declare the
// (loosely-typed) slice of the viewer API that PdfViewer.vue drives. This is the
// external-library boundary; the main API import stays fully typed.
declare module 'pdfjs-dist/web/pdf_viewer.mjs' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export class EventBus {
    on(name: string, listener: (evt: any) => void): void
    off(name: string, listener: (evt: any) => void): void
    dispatch(name: string, data?: any): void
  }
  export class PDFLinkService {
    constructor(opts?: any)
    setViewer(viewer: any): void
    setDocument(doc: any, baseUrl?: string | null): void
  }
  export class PDFViewer {
    constructor(opts: any)
    setDocument(doc: any): void
    currentScaleValue: string
    get annotationEditorMode(): { mode: number }
    set annotationEditorMode(value: { mode: number; editId?: string | null })
    cleanup(): void
  }
  export class GenericL10n {
    constructor(lang?: string)
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

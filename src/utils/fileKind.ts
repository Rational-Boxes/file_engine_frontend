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

// What KIND of file a name is, for its icon and for whether a preview can ever
// be offered.
//
// Two different questions, answered from two different places:
//
//   - The kind (and so the icon) is presentation, settled here from the name.
//   - Whether conversion is offered is the DEPLOYMENT's answer: csai reports
//     which formats its installed plugins can render (capabilities.conversion,
//     derived from the same registry the pipeline dispatches with). This module
//     only applies it — see conversionOffer.
//
// The one place they meet: an opaque binary — an executable, an archive, a disk
// image, a compiled library — is never offered conversion, whatever a name
// lookup on the server says. No converter turns a program into something to
// look at, and a system MIME table can call `.a` "text/vnd.a".

import { modelIcon, is3DModel } from './modelFormat'

export type FileKind =
  | 'folder'
  | 'model'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'text'
  | 'executable'
  | 'archive'
  | 'disk-image'
  | 'library'
  | 'database'
  | 'font'
  | 'binary'
  | 'file'

const EXT_KIND: Record<string, FileKind> = {}
const add = (kind: FileKind, exts: string) => {
  for (const e of exts.split(/\s+/).filter(Boolean)) EXT_KIND[e] = kind
}

add('pdf', 'pdf')
add('image', 'apng avif bmp gif ico cur jfif jpeg jpg png svg webp tif tiff heic heif psd raw cr2 nef dng xcf')
add('video', 'mp4 m4v mov webm mkv avi wmv flv mpg mpeg 3gp ogv ts')
add('audio', 'mp3 wav flac aac m4a ogg oga opus wma aiff aif mid midi')
add('document', 'doc docx odt rtf pages epub')
add('spreadsheet', 'xls xlsx ods csv tsv numbers')
add('presentation', 'ppt pptx odp key')
add('text', 'txt md markdown log ini cfg conf')
add('code',
  'py js mjs cjs ts tsx jsx vue c h cc cpp hpp cs java kt go rs rb php pl sh bash zsh ' +
  'ps1 sql json yaml yml toml xml html htm css scss swift lua r m')
add('executable', 'exe com msi bat cmd app apk ipa deb rpm appimage run bin elf out')
add('archive', 'zip tar gz tgz bz2 tbz xz txz zst 7z rar cab jar war ear whl lz lzma')
add('disk-image', 'iso img dmg vhd vhdx vmdk qcow2 ova')
add('library', 'dll so dylib a lib o obj-coff ko sys pyc pyo class wasm')
add('database', 'db sqlite sqlite3 mdb accdb dbf frm ibd')
add('font', 'ttf otf woff woff2 eot fon')

// Kinds that are opaque bytes: nothing to look at, so no preview is offered and
// the honest affordance is a download.
const OPAQUE: ReadonlySet<FileKind> = new Set<FileKind>([
  'executable', 'archive', 'disk-image', 'library', 'database', 'font', 'binary',
])

// The lower-case extension, or '' for none. A leading dot alone (".bashrc") is
// a name, not an extension.
export function extensionOf(name: string): string {
  const dot = (name || '').lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export function fileKind(name: string, isDirectory = false): FileKind {
  if (isDirectory) return 'folder'
  // 3D before the extension table: `.obj` is a mesh here, not an object file.
  if (is3DModel(name)) return 'model'
  return EXT_KIND[extensionOf(name)] ?? 'file'
}

export const isOpaqueBinary = (kind: FileKind): boolean => OPAQUE.has(kind)

const ICON: Record<FileKind, string> = {
  folder: '📁',
  model: '🧊',
  pdf: '📕',
  image: '🖼️',
  video: '🎞️',
  audio: '🎵',
  document: '📝',
  spreadsheet: '📊',
  presentation: '📽️',
  code: '📜',
  text: '📄',
  executable: '⚙️',
  archive: '🗜️',
  'disk-image': '💿',
  library: '🧩',
  database: '🗄️',
  font: '🔤',
  binary: '🔢',
  file: '📄',
}

/** The type glyph for a file — a 3D format keeps its own, more specific one. */
export function fileIcon(name: string, isDirectory = false): string {
  if (!isDirectory) {
    const m = modelIcon(name)
    if (m) return m
  }
  return ICON[fileKind(name, isDirectory)]
}

const LABEL: Partial<Record<FileKind, string>> = {
  executable: 'Programs and installers',
  archive: 'Archives',
  'disk-image': 'Disk images',
  library: 'Compiled libraries and bytecode',
  database: 'Database files',
  font: 'Font files',
  binary: 'Binary files',
  audio: 'Audio files',
}

/** Why there is no preview, in words, for the kinds that have a reason. */
export function noPreviewReason(kind: FileKind): string {
  const label = LABEL[kind]
  return label ? `${label} can't be previewed.` : 'No preview is available for this file type.'
}

// ── whether to offer conversion ──────────────────────────────────────────────

export interface ConversionFormats {
  /** False until (and unless) csai has reported its formats — an older csai
   *  does not, and unknown is not "nothing": conversion stays offered, as it
   *  always was, and the server's answer for the file decides. */
  known: boolean
  /** Extensions a plugin can render here and now (tools present). Lower-case,
   *  no dot; double extensions such as `city.json` appear whole. */
  previewExtensions: readonly string[]
}

//   'offer'    a plugin here can render it — offer "Generate preview"
//   'none'     nothing installed renders it — offer the download instead
//   'unknown'  the deployment has not said; offer it and let /convert answer
export type ConversionOffer = 'offer' | 'none' | 'unknown'

export function conversionOffer(name: string, formats: ConversionFormats): ConversionOffer {
  if (isOpaqueBinary(fileKind(name))) return 'none'
  if (!formats.known) return 'unknown'
  const lower = (name || '').toLowerCase()
  const supported = formats.previewExtensions.some((ext) => lower.endsWith('.' + ext))
  return supported ? 'offer' : 'none'
}

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

// Which files the plain-text editor will open.
//
// DECIDED BY EXTENSION, and it has to be: the bridge serves every file as
// application/octet-stream (http_server.cpp), and neither the directory listing
// nor stat carries a MIME type. So "is this text?" is a question only the client
// can answer, from the name — the same way utils/office.ts decides what
// ONLYOFFICE will open and utils/previewable.ts decides what the browser renders
// inline.
//
// The list is what a person would call a text file, which is broader than
// text/* in a MIME registry: .json and .xml are application/* by IANA and are
// unmistakably text to edit, while .csv is text/csv and also opens in the
// spreadsheet editor. Overlap with ONLYOFFICE is deliberate and not a conflict —
// a .txt or .csv offers both, and they are different jobs: one edits the
// characters, the other formats a document.
//
// NOT here, deliberately: anything whose bytes are a container the editor would
// corrupt by round-tripping as text (.docx, .pdf, .xlsx), and anything with no
// extension at all — a bare `LICENSE` or `Makefile` is very likely text, but
// guessing wrong means opening a binary in a textarea and offering to save it
// back, which is a data-loss shape. Extensions are the conservative answer.

const TEXT_EXTS: readonly string[] = [
  // plain prose and notes
  'txt', 'text', 'md', 'markdown', 'rst', 'adoc', 'log', 'nfo',
  // structured data / config
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'properties', 'env', 'csv', 'tsv', 'xml', 'plist',
  // web
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'svg',
  // source
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'py', 'rb', 'go', 'rs',
  'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs',
  'php', 'pl', 'pm', 'lua', 'r', 'sql', 'swift', 'scala', 'sh', 'bash',
  'zsh', 'fish', 'ps1', 'bat', 'cmd', 'dockerfile', 'containerfile',
  'gradle', 'tf', 'tfvars', 'proto', 'graphql', 'gql', 'patch', 'diff',
]

const EDITABLE_TEXT = new Set(TEXT_EXTS)

export function textFileExtension(name: string): string {
  const n = name || ''
  const dot = n.lastIndexOf('.')
  return dot > 0 ? n.slice(dot + 1).toLowerCase() : ''
}

/** True when `name` is a text file the inline editor can open safely. */
export function isEditableText(name: string): boolean {
  return EDITABLE_TEXT.has(textFileExtension(name))
}

/** The extensions offered, for tests and for anything that wants to show them. */
export const editableTextExtensions = (): readonly string[] => TEXT_EXTS

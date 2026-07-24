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

// The chat/report LLM refers to files by their UID in the literal form
// "(file <uid>)" — that's how the model is given file identity. Users should never
// see a raw UID, so before rendering an answer we rewrite each reference into a
// link that shows the file's NAME and opens it in the preview overlay (see
// ChatView). The convert_search_ai backend applies the SAME rewrite to saved HTML
// reports, so this pattern is the shared contract between the two.
//
// The UID is matched conservatively — hex and dashes, at least 8 chars (file UIDs
// are UUIDs) — so ordinary parenthetical prose like "(file cabinet)" is never
// touched.
const FILE_REF_RE = /\(file\s+([0-9a-fA-F-]{8,})\)/g

// Collect the unique file UIDs referenced as "(file <uid>)" in a block of text —
// used to drive name resolution before (or as) the text is linkified.
export function extractFileRefUids(text: string): string[] {
  if (!text) return []
  const uids = new Set<string>()
  for (const m of text.matchAll(FILE_REF_RE)) uids.add(m[1])
  return [...uids]
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

// Rewrite every "(file <uid>)" reference into an anchor carrying the UID in a data
// attribute (so the shadow-root click handler can open the file) and showing the
// resolved file name where known, a neutral placeholder otherwise. The surrounding
// parentheses are preserved so the sentence still reads naturally. The output is a
// small, self-contained HTML fragment that is safe to feed through the Markdown +
// DOMPurify pipeline (which keeps `href`, `class`, and `data-*`).
export function linkifyFileRefs(text: string, names: Record<string, string> = {}): string {
  if (!text) return text
  return text.replace(FILE_REF_RE, (_m, uid: string) => {
    const name = names[uid]
    const label = name ? `📄 ${name}` : '📄 file'
    return `(<a href="#" class="file-ref" data-file-uid="${escapeHtml(uid)}">${escapeHtml(label)}</a>)`
  })
}

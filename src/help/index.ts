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

import { renderMarkdown } from '@/utils/markdown'

// Registry for in-app help content (design_documents/HELP_SYSTEM_PLAN.md).
//
// Each topic is a markdown file under ./content/*.md carrying YAML frontmatter.
// Vite inlines the raw source at build time (no runtime fetch), and we compile
// the frontmatter into a single typed registry here — the one source of truth
// that both <HelpIcon> and <HelpModal> resolve topics through. An id that does
// not resolve is therefore a caught error, not a broken link.

export interface HelpTopic {
  id: string
  title: string
  category: string
  keywords: string[]
  order: number
  related: string[]
  /** Raw markdown body (frontmatter stripped). Rendered lazily via renderTopic. */
  body: string
}

// Category display order. Anything not listed sorts last, alphabetically.
const CATEGORY_ORDER = [
  'Getting Started',
  'Working with files',
  'Permissions',
  'Collaboration',
  '3D & CAD/BIM',
  'AI Research',
  'Your account',
]

// The landing topic opened when help is launched from the global link with no
// prior reading position.
export const DEFAULT_TOPIC = 'getting-started'

// Minimal YAML-ish frontmatter parser. Content is first-party and in-repo, so we
// only need scalars and inline arrays ([a, b, c]) — not a full YAML engine.
function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!m) return { data: {}, body: raw }
  const data: Record<string, string | string[]> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      data[key] = val.replace(/^["']|["']$/g, '')
    }
  }
  return { data, body: m[2] }
}

function toTopic(path: string, raw: string): HelpTopic {
  const { data, body } = parseFrontmatter(raw)
  // Fall back to the filename (minus extension) so a missing id is still usable.
  const fileId = path.split('/').pop()!.replace(/\.md$/, '')
  return {
    id: (data.id as string) || fileId,
    title: (data.title as string) || fileId,
    category: (data.category as string) || 'Getting Started',
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    order: Number(data.order ?? 100),
    related: Array.isArray(data.related) ? data.related : [],
    body,
  }
}

const modules = import.meta.glob('./content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const registry: Record<string, HelpTopic> = {}
for (const [path, raw] of Object.entries(modules)) {
  const topic = toTopic(path, raw)
  registry[topic.id] = topic
}

export function getTopic(id: string | null | undefined): HelpTopic | undefined {
  return id ? registry[id] : undefined
}

export function allTopics(): HelpTopic[] {
  return Object.values(registry).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}

export interface HelpCategoryGroup {
  category: string
  topics: HelpTopic[]
}

// Topics grouped by category, categories in CATEGORY_ORDER then alphabetical.
export function categorizedTopics(): HelpCategoryGroup[] {
  const byCat = new Map<string, HelpTopic[]>()
  for (const t of allTopics()) {
    const list = byCat.get(t.category) ?? []
    list.push(t)
    byCat.set(t.category, list)
  }
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c)
    return i === -1 ? CATEGORY_ORDER.length : i
  }
  return [...byCat.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([category, topics]) => ({ category, topics }))
}

// Case-insensitive match over title and keywords. Trusted, small corpus, so a
// linear scan is more than adequate.
export function searchTopics(query: string): HelpTopic[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return allTopics().filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.keywords.some((k) => k.toLowerCase().includes(q)),
  )
}

// Render a topic's markdown body to sanitized HTML. Content is first-party, so
// unlike LLM output it needs no Shadow DOM isolation — but we still run it through
// the shared sanitizing pipeline (defense in depth).
export function renderTopic(id: string): string {
  const t = registry[id]
  // breaks:false — help content is hard-wrapped prose, so a single newline is a
  // wrap, not an intentional line break (unlike chat answers).
  return t ? renderMarkdown(t.body, { breaks: false }) : ''
}

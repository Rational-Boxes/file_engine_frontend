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
import { allTopics, getTopic, renderTopic, searchTopics } from '@/help'

describe('help registry', () => {
  it('every topic has the frontmatter the UI depends on', async () => {
    for (const t of allTopics()) {
      expect(t.id, 'id').toBeTruthy()
      expect(t.title, `${t.id}: title`).toBeTruthy()
      expect(t.category, `${t.id}: category`).toBeTruthy()
      expect(t.body.trim(), `${t.id}: body`).not.toBe('')
    }
  })

  it('every `related` id resolves to a real topic', () => {
    // A dangling related id is a dead end in the one place a confused user
    // goes next, and nothing else in the build would catch it.
    const missing: string[] = []
    for (const t of allTopics()) {
      for (const r of t.related) {
        if (!getTopic(r)) missing.push(`${t.id} -> ${r}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('every in-page #topic link resolves too', () => {
    // The pages cross-reference each other as (#topic-id); those are resolved
    // through this same registry, so a rename breaks them silently.
    const missing: string[] = []
    for (const t of allTopics()) {
      for (const m of t.body.matchAll(/\]\(#([a-z0-9-]+)\)/g)) {
        if (!getTopic(m[1])) missing.push(`${t.id} -> #${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('ids are unique', () => {
    const ids = allTopics().map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries the external share-link page and it renders', () => {
    const t = getTopic('share-links')
    expect(t).toBeDefined()
    expect(renderTopic('share-links')).toContain('<')
  })

  it('covers every user-facing feature that has a UI surface', () => {
    // A feature people can see but cannot look up is a support question waiting
    // to happen, so the list is asserted rather than left to whoever notices.
    for (const id of ['folder-actions', 'comparing', 'share-links']) {
      expect(getTopic(id), id).toBeDefined()
      expect(renderTopic(id), id).toContain('<')
    }
  })

  it('finds the new pages for the words people actually search', () => {
    const wanted: Record<string, string> = {
      // Folder actions — people search for what they want to HAPPEN, not the
      // feature's name.
      automatic: 'folder-actions',
      webhook: 'folder-actions',
      // Comparison — almost nobody types "difference service".
      'what changed': 'comparing',
      diff: 'comparing',
      redline: 'comparing',
    }
    for (const [query, id] of Object.entries(wanted)) {
      expect(searchTopics(query).map((t) => t.id), `search: ${query}`).toContain(id)
    }
  })

  it('finds the share-link page for the words people actually search', () => {
    // "How do I send this to someone outside?" — the page is useless if the
    // search that leads to it lands on the ACL page instead.
    for (const q of ['outside', 'drop box', 'contractor', 'no account']) {
      const hits = searchTopics(q).map((t) => t.id)
      expect(hits, `search: ${q}`).toContain('share-links')
    }
  })
})

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

// Client for the BCF-API 2.1 subservice — specifically the BCF-XML export door,
// which turns an anchored discussion comment into a downloadable `.bcfzip`. This
// gives users an interchange file when driving the BCF-API directly is impractical.
//
// The dev proxy maps `/bcf` -> :8098 WITHOUT stripping the prefix (the service's
// router is itself mounted under `/bcf`), so the request path is `/bcf/2.1/...`.
// Override the origin with VITE_BCF_BASE when the SPA is served elsewhere.
import type { Thread } from '@/services/discussionService'

const BCF_BASE = import.meta.env.VITE_BCF_BASE ?? ''

// The export endpoint's topic shape (BCF-XML §11). Viewpoint snapshots would ride
// as `snapshot_b64`; we omit them (the anchor keeps the snapshot as a rendition
// reference, not inline bytes — the camera/section/selection is what matters here).
export interface BcfExportViewpoint {
  guid: string
  viewpoint: unknown
  snapshot_b64?: string
}
export interface BcfExportComment {
  guid: string
  author: string
  comment: string
  viewpoint_guid?: string
}
export interface BcfExportTopic {
  guid: string
  title: string
  topic_type: string
  topic_status: string
  creation_author: string
  comments: BcfExportComment[]
  viewpoints: BcfExportViewpoint[]
}

// Build a BCF-2.1 topic from a model-viewpoint-anchored thread. Returns null for a
// plain (non-anchored) thread — those have no viewpoint to export. Every comment is
// linked to the single captured viewpoint so a BCF Manager shows the pin on each.
export function buildBcfTopic(thread: Thread): BcfExportTopic | null {
  if (thread.anchor?.kind !== 'model-viewpoint') return null
  const comments = (thread.comments ?? []).filter((c) => !c.deleted && !c.redacted)
  const vpGuid = `${thread.id}-vp`
  const title =
    thread.title?.trim() ||
    comments[0]?.body?.trim().split('\n')[0].slice(0, 100) ||
    'Model comment'
  return {
    guid: thread.id,
    title,
    topic_type: 'Comment',
    topic_status: thread.status === 'resolved' ? 'Closed' : 'Open',
    creation_author: thread.openedBy || comments[0]?.author || '',
    comments: comments.map((c) => ({
      guid: c.id,
      author: c.author,
      comment: c.body,
      viewpoint_guid: vpGuid,
    })),
    viewpoints: [{ guid: vpGuid, viewpoint: thread.anchor.viewpoint }],
  }
}

// A filesystem-safe `.bcfzip` name derived from the topic title (fallback: guid).
export function bcfFilename(topic: BcfExportTopic): string {
  const base = (topic.title || topic.guid)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return `${base || topic.guid}.bcfzip`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Export one anchored comment thread as a downloaded `.bcfzip`, using the server's
// BCF-XML codec (POST /bcf/2.1/bcf-xml/export). Throws if the thread has no
// viewpoint or the service returns a non-OK response.
export async function downloadThreadBcf(thread: Thread): Promise<void> {
  const topic = buildBcfTopic(thread)
  if (!topic) throw new Error('This comment has no 3D viewpoint to export.')
  const res = await fetch(`${BCF_BASE}/bcf/2.1/bcf-xml/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topics: [topic] }),
  })
  if (!res.ok) throw new Error(`BCF export failed (${res.status})`)
  triggerDownload(await res.blob(), bcfFilename(topic))
}

export const bcfService = { buildBcfTopic, bcfFilename, downloadThreadBcf }
export default bcfService

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

import discussionClient from '@/services/discussionClient'

// Typed client for the discussion service. The API speaks snake_case; we map to
// camelCase at this boundary so the rest of the SPA stays idiomatic.

export interface Comment {
  id: string
  threadId: string
  parentCommentId: string | null
  author: string
  body: string
  createdAt: string
  editedAt: string | null
  deleted: boolean
  redacted: boolean
  redactedBy?: string | null
  redactedReason?: string | null
  fileUid?: string
}

export interface Revision {
  body: string
  editedAt: string
}

export interface MentionUser {
  user: string
  email: string
}

// A 3D annotation anchor (§4/§9): the current view captured as a BCF-2.1
// viewpoint, plus an optional world-space marker and source-tagged object refs.
// null anchor = a plain file-level comment (unchanged behaviour). The `viewpoint`
// is what xeokit's BCFViewpointsPlugin.getViewpoint() emits — camera, visibility,
// selection, clipping planes, snapshot — so it restores exactly via setViewpoint().
// A captured measurement endpoint: a world-space point and (when the pick landed on
// geometry) the id of the element it snapped to, so the measurement can be re-pinned.
export interface AnchorMeasurePoint {
  pos: [number, number, number]
  entity?: string
}

// A measurement persisted with a comment (Option B — FileEngine-native, since BCF
// has no measurement/dimension entity). `points` holds the ordered endpoints:
// distance → [origin, target]; angle → [origin, corner, target]. `value` is the
// length/angle at capture time, kept for reference (the viewer recomputes on render).
export interface AnchorMeasurement {
  type: 'distance' | 'angle'
  points: AnchorMeasurePoint[]
  value?: number
}

export interface ModelViewpointAnchor {
  kind: 'model-viewpoint'
  schema: string
  viewpoint: unknown
  marker?: { x: number; y: number; z: number }
  object_refs?: unknown[]
  snapshot_rendition_uid?: string
  measurements?: AnchorMeasurement[]
}

export interface Thread {
  id: string
  fileUid: string
  version: string
  title: string
  status: 'open' | 'resolved'
  openedBy: string
  createdAt: string
  updatedAt: string
  resolvedBy: string | null
  resolvedVersion: string | null
  anchorStale: boolean
  anchor: ModelViewpointAnchor | null
  comments?: Comment[]
}

export interface Notification {
  id: number
  kind: string
  fileUid: string
  threadId: string | null
  reviewId: string | null
  actor: string
  createdAt: string
  readAt: string | null
}

export interface Activity {
  id: number
  fileUid: string
  eventType: string
  version: string
  name: string
  path: string
  actor: string
  ts: string
}

export interface FlagCounts {
  mentions: number
  reviews: number
}

export interface ReviewRequest {
  id: string
  fileUid: string
  version: string
  threadId: string | null
  requester: string
  reviewer: string
  status: 'requested' | 'acknowledged' | 'completed' | 'declined'
  outcome: string | null
  createdAt: string
  acknowledgedAt: string | null
  completedAt: string | null
}

function toReview(r: Record<string, unknown>): ReviewRequest {
  return {
    id: r.id as string,
    fileUid: r.file_uid as string,
    version: (r.version as string) ?? '',
    threadId: (r.thread_id as string) ?? null,
    requester: r.requester as string,
    reviewer: r.reviewer as string,
    status: (r.status as ReviewRequest['status']) ?? 'requested',
    outcome: (r.outcome as string) ?? null,
    createdAt: r.created_at as string,
    acknowledgedAt: (r.acknowledged_at as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
  }
}

function toComment(c: Record<string, unknown>): Comment {
  return {
    id: c.id as string,
    threadId: c.thread_id as string,
    parentCommentId: (c.parent_comment_id as string) ?? null,
    author: c.author as string,
    body: (c.body as string) ?? '',
    createdAt: c.created_at as string,
    editedAt: (c.edited_at as string) ?? null,
    deleted: !!c.deleted,
    redacted: !!c.redacted,
    redactedBy: (c.redacted_by as string) ?? null,
    redactedReason: (c.redacted_reason as string) ?? null,
    fileUid: c.file_uid as string | undefined,
  }
}

function toThread(t: Record<string, unknown>): Thread {
  return {
    id: t.id as string,
    fileUid: t.file_uid as string,
    version: (t.version as string) ?? '',
    title: (t.title as string) ?? '',
    status: (t.status as 'open' | 'resolved') ?? 'open',
    openedBy: t.opened_by as string,
    createdAt: t.created_at as string,
    updatedAt: t.updated_at as string,
    resolvedBy: (t.resolved_by as string) ?? null,
    resolvedVersion: (t.resolved_version as string) ?? null,
    anchorStale: !!t.anchor_stale,
    anchor: (t.anchor as ModelViewpointAnchor) ?? null,
    comments: Array.isArray(t.comments) ? (t.comments as Record<string, unknown>[]).map(toComment) : undefined,
  }
}

function toNotification(n: Record<string, unknown>): Notification {
  return {
    id: n.id as number,
    kind: n.kind as string,
    fileUid: n.file_uid as string,
    threadId: (n.thread_id as string) ?? null,
    reviewId: (n.review_id as string) ?? null,
    actor: n.actor as string,
    createdAt: n.created_at as string,
    readAt: (n.read_at as string) ?? null,
  }
}

function toActivity(a: Record<string, unknown>): Activity {
  return {
    id: a.id as number,
    fileUid: a.file_uid as string,
    eventType: a.event_type as string,
    version: (a.version as string) ?? '',
    name: (a.name as string) ?? '',
    path: (a.path as string) ?? '',
    actor: (a.actor as string) ?? '',
    ts: a.ts as string,
  }
}

// Pull @handles out of a comment body so they can be sent as the mentions array
// (the backend validates each against who-can-read; §5.1).
export function extractMentions(text: string): string[] {
  return [...new Set([...(text || '').matchAll(/@([\w.@-]+)/g)].map((m) => m[1]))]
}

export const discussionService = {
  // -- threads & comments -------------------------------------------------
  async listThreads(fileUid: string, status?: 'open' | 'resolved'): Promise<Thread[]> {
    const { data } = await discussionClient.get(`/files/${fileUid}/threads`, {
      params: status ? { status } : {},
    })
    return (data?.threads ?? []).map(toThread)
  },

  async openThread(
    fileUid: string,
    payload: {
      title?: string
      body: string
      version?: string
      mentions?: string[]
      anchor?: ModelViewpointAnchor | null
    },
  ): Promise<Thread> {
    const { data } = await discussionClient.post(`/files/${fileUid}/threads`, payload)
    return toThread(data)
  },

  async getThread(threadId: string): Promise<Thread> {
    const { data } = await discussionClient.get(`/threads/${threadId}`)
    return toThread(data)
  },

  async reply(
    threadId: string,
    body: string,
    opts: { mentions?: string[]; parentCommentId?: string } = {},
  ): Promise<Comment> {
    const { data } = await discussionClient.post(`/threads/${threadId}/comments`, {
      body,
      mentions: opts.mentions ?? [],
      parent_comment_id: opts.parentCommentId,
    })
    return toComment(data)
  },

  async revisions(commentId: string): Promise<Revision[]> {
    const { data } = await discussionClient.get(`/comments/${commentId}/revisions`)
    return (data?.revisions ?? []).map((r: Record<string, unknown>) => ({
      body: (r.body as string) ?? '',
      editedAt: r.edited_at as string,
    }))
  },

  async mentionable(fileUid: string, q: string): Promise<MentionUser[]> {
    if (!q) return []
    const { data } = await discussionClient.get(`/files/${fileUid}/mentionable`, { params: { q } })
    return (data?.users ?? []) as MentionUser[]
  },

  async setThreadStatus(threadId: string, status: 'open' | 'resolved', resolvedVersion?: string): Promise<Thread> {
    const { data } = await discussionClient.patch(`/threads/${threadId}`, {
      status,
      resolved_version: resolvedVersion,
    })
    return toThread(data)
  },

  async editComment(commentId: string, body: string): Promise<Comment> {
    const { data } = await discussionClient.patch(`/comments/${commentId}`, { body })
    return toComment(data)
  },

  async deleteComment(commentId: string): Promise<boolean> {
    const { data } = await discussionClient.delete(`/comments/${commentId}`)
    return !!data?.deleted
  },

  async redactComment(commentId: string, reason: string): Promise<Comment> {
    const { data } = await discussionClient.post(`/comments/${commentId}/redact`, { reason })
    return toComment(data)
  },

  async getComment(commentId: string): Promise<Comment> {
    const { data } = await discussionClient.get(`/comments/${commentId}`)
    return toComment(data)
  },

  // -- reviews ------------------------------------------------------------
  async raiseReview(
    fileUid: string,
    reviewers: string[],
    opts: { version?: string; threadId?: string } = {},
  ): Promise<ReviewRequest[]> {
    const { data } = await discussionClient.post(`/files/${fileUid}/reviews`, {
      reviewers,
      version: opts.version,
      thread_id: opts.threadId,
    })
    return (data?.reviews ?? []).map(toReview)
  },

  async listReviews(role: 'requester' | 'reviewer' | 'both' = 'both', status?: string): Promise<ReviewRequest[]> {
    const { data } = await discussionClient.get('/reviews', { params: { role, status } })
    return (data?.reviews ?? []).map(toReview)
  },

  // The full review record for one file — every request raised on it (any
  // requester/reviewer), READ-gated on the anchor. Backs the side-bar Reviews tab.
  async listFileReviews(fileUid: string, status?: string): Promise<ReviewRequest[]> {
    const { data } = await discussionClient.get(`/files/${fileUid}/reviews`, {
      params: status ? { status } : {},
    })
    return (data?.reviews ?? []).map(toReview)
  },

  async acknowledgeReview(reviewId: string): Promise<ReviewRequest> {
    const { data } = await discussionClient.post(`/reviews/${reviewId}/acknowledge`)
    return toReview(data)
  },

  async completeReview(reviewId: string, outcome?: string): Promise<ReviewRequest> {
    const { data } = await discussionClient.post(`/reviews/${reviewId}/complete`, { outcome })
    return toReview(data)
  },

  // -- dashboard ----------------------------------------------------------
  async attention(opts: { limit?: number; unread?: boolean } = {}): Promise<Notification[]> {
    const { data } = await discussionClient.get('/dashboard/attention', { params: opts })
    return (data?.items ?? []).map(toNotification)
  },

  async markSeen(notificationId: number): Promise<boolean> {
    const { data } = await discussionClient.post(`/dashboard/attention/${notificationId}/seen`)
    return !!data?.seen
  },

  async activity(opts: { limit?: number } = {}): Promise<Activity[]> {
    const { data } = await discussionClient.get('/dashboard/activity', { params: opts })
    return (data?.items ?? []).map(toActivity)
  },

  // -- file-list attention flags (batch, §10e) ----------------------------
  async flags(fileUids: string[]): Promise<Record<string, FlagCounts>> {
    if (!fileUids.length) return {}
    const { data } = await discussionClient.post('/attention/flags', { file_uids: fileUids })
    return (data?.flags ?? {}) as Record<string, FlagCounts>
  },
}

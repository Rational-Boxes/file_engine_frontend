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

import csaiClient from '@/services/csaiClient'

/**
 * A file's publish state, from convert_search_ai (MEDIA_SHARE.md §4.6).
 *
 * Read-only here, deliberately: there is no "Publish" button anywhere in the
 * SPA (§4.3). Publishing happens because a media share was configured — the
 * Share tab mints the link and share_service asks CSAI to publish, as the
 * creator. This module only REPORTS what that set in motion.
 */
export interface MediaJob {
  job_uid: string
  profile: string
  status: 'queued' | 'running' | 'succeeded' | 'skipped' | 'failed' | 'cancelled'
  progress_pct: number
  started_at: string | null
  finished_at: string | null
  output_bytes: number | null
  duration_ms: number | null
  detail: string | null
}

export interface MediaState {
  file_uid: string
  source_version: string
  mime: string
  jobs: MediaJob[]
  renditions: string[]
}

/** The rendition a link plays, per kind of source: video first, else audio. */
export const PRIMARY_PROFILES = ['video-720p-vp9', 'audio-mp3']
const TERMINAL = ['succeeded', 'skipped', 'failed', 'cancelled']

export function primaryJob(st: MediaState | null): MediaJob | undefined {
  if (!st) return undefined
  for (const p of PRIMARY_PROFILES) {
    const j = st.jobs.find((x) => x.profile === p)
    if (j) return j
  }
  return undefined
}

/** The current version's playable copy exists. */
export function isPublished(st: MediaState | null): boolean {
  return primaryJob(st)?.status === 'succeeded'
}

export function inProgress(st: MediaState | null): boolean {
  return !!st && st.jobs.some((j) => !TERMINAL.includes(j.status))
}

/** 0–100 across the jobs still to finish; null when nothing is running. */
export function progressPct(st: MediaState | null): number | null {
  if (!st || !inProgress(st)) return null
  const all = st.jobs.filter((j) => j.status !== 'skipped' && j.status !== 'cancelled')
  if (!all.length) return null
  const sum = all.reduce((n, j) => n + (j.status === 'succeeded' ? 100 : j.progress_pct || 0), 0)
  return Math.round(sum / all.length)
}

/**
 * Seconds left, from the elapsed time and the progress so far — an estimate
 * stated as one. Null until there is enough progress to extrapolate from.
 */
export function etaSeconds(st: MediaState | null, now = Date.now()): number | null {
  const pct = progressPct(st)
  const started = st?.jobs
    .map((j) => (j.started_at ? Date.parse(j.started_at) : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)[0]
  if (pct == null || pct < 5 || started == null) return null
  const elapsed = (now - started) / 1000
  return Math.max(0, Math.round((elapsed * (100 - pct)) / pct))
}

/** A user-safe reason the primary failed (e.g. the PeerTube/YouTube pointer). */
export function failureDetail(st: MediaState | null): string | null {
  const j = primaryJob(st)
  return j && (j.status === 'failed' || j.status === 'skipped') ? j.detail || null : null
}

export const mediaService = {
  async state(fileUid: string): Promise<MediaState> {
    const { data } = await csaiClient.get(`/documents/${fileUid}/media`)
    return data
  },
}

export default mediaService

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

/**
 * End-to-end: the Share tab's media flow against the live stack (MS6).
 *
 * Mints a media link the way ShareTab does, watches it as an outside viewer
 * through the media door, and then reads back what MediaLinkDetail reads —
 * asserting the live API carries every field the components use, and that the
 * SPA's own helpers (imported, not re-implemented) interpret it correctly. The
 * contract between share_service / csai and the UI is the thing a unit test
 * with mocked services cannot see drift in.
 *
 *   FE_PASS=… npx vite-node e2e/media-share-owner.ts
 * Env: FE_PASS (required); BRIDGE_URL, SHARE_URL, CSAI_URL, FE_USER, FE_TENANT,
 * MAILHOG_URL.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isPublished, progressPct, type MediaState } from '@/services/mediaService'
import type { AudienceRow, LinkAudience, ShareCapabilities } from '@/services/shareService'

const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const SHARE = process.env.SHARE_URL || 'http://localhost:8101'
const CSAI = process.env.CSAI_URL || 'http://localhost:8092'
const MAILHOG = process.env.MAILHOG_URL || 'http://localhost:8025'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS
const TENANT = process.env.FE_TENANT || 'default'
const ROOT = '00000000-0000-0000-0000-000000000000'
if (!PASS) { console.error('FE_PASS is required.'); process.exit(1) }

let passed = 0
let failed = 0
const assert = (c: unknown, m: string) => { if (c) { passed++; console.log('  ✓', m) } else { failed++; console.error('  ✗', m) } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let token = ''
const H = (x: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...x })
const J = { 'Content-Type': 'application/json' }
const json = async (r: Response) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }

async function login(): Promise<string> {
  const basic = Buffer.from(`${USER}:${PASS}`).toString('base64')
  const first = await json(await fetch(`${BRIDGE}/v1/auth/token`, { method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'X-Tenant': TENANT } }))
  if (first?.token) return first.token
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, action: 'send', method: 'email' }) })
  let code = ''
  for (let i = 0; i < 40 && !code; i++) {
    await sleep(250)
    const raw: string = (await json(await fetch(`${MAILHOG}/api/v2/messages`)))?.items?.[0]?.Content?.Body || ''
    code = (raw.replace(/=\r?\n/g, '').match(/\b(\d{6})\b/) || [])[1] || ''
  }
  const done = await json(await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, method: 'email', code }) }))
  return done.token
}

async function waitFor<T>(what: string, secs: number, probe: () => Promise<T | undefined>) {
  const end = Date.now() + secs * 1000
  while (Date.now() < end) { const v = await probe(); if (v) return v; await sleep(2000) }
  console.error(`  … gave up waiting for ${what}`)
  return undefined
}

/** Every field MediaLinkDetail reads from a roster row. */
const ROW_FIELDS: (keyof AudienceRow)[] = ['email', 'verified', 'on_allowlist', 'last_seen_utc',
  'plays', 'coverage_pct', 'furthest_pct', 'completed', 'completion_basis', 'dropoff_seconds',
  'device_class', 'coverage_bits', 'has_playback']

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'fe-media-owner-'))
  const src = join(work, 'clip.mp4')
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '4', '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'aac',
    '-shortest', src])
  token = await login()
  let fileUid = ''
  let linkUid = ''
  try {
    console.log('== what the Share tab asks first')
    const caps: ShareCapabilities = await json(await fetch(`${SHARE}/share/v1/capabilities`, { headers: H() }))
    assert(caps.media?.available === true, 'share_service offers media links')
    assert(typeof caps.media.open_mode === 'boolean' && caps.media.default_max_bytes > 0,
      'capabilities carry the open switch and the default budget')
    const csaiCaps = await json(await fetch(`${CSAI}/v1/capabilities`, { headers: H() }))
    // The live shape the SPA's capabilitiesService reads (it once read a field
    // csai never sent, and the media branch could never have appeared).
    assert(csaiCaps?.media?.publish === true, 'csai reports it can publish (media.publish)')

    console.log('== upload; the tab says it will prepare a copy')
    fileUid = (await json(await fetch(`${BRIDGE}/v1/dirs/${ROOT}/files`, { method: 'POST',
      headers: H(J), body: JSON.stringify({ name: `e2e-owner-${process.pid}.mp4` }) }))).uid
    await fetch(`${BRIDGE}/v1/files/${fileUid}/content`, { method: 'PUT',
      headers: H({ 'Content-Type': 'application/octet-stream' }), body: readFileSync(src) })
    const before: MediaState = await json(await fetch(`${CSAI}/documents/${fileUid}/media`, { headers: H() }))
    assert(!isPublished(before), 'nothing published before a share (the will-prepare branch)')

    console.log('== mint, as ShareTab sends it')
    const created = await json(await fetch(`${SHARE}/share/v1/nodes/${fileUid}/links`, { method: 'POST',
      headers: H(J), body: JSON.stringify({ kind: 3, access_mode: 'claimed', recipients: [],
                                            ttl_days: 7, display_name: 'Owner E2E' }) }))
    linkUid = created.link_uid
    assert(created.kind === 3 && created.media_state === 'pending_media', 'minted pending_media')
    assert(typeof created.url === 'string' && created.url.includes('/s/'), 'the landing URL, shown once')
    const during: MediaState = await json(await fetch(`${CSAI}/documents/${fileUid}/media`, { headers: H() }))
    assert(progressPct(during) != null || isPublished(during), 'progress is reportable while it encodes')

    const ready = await waitFor('ready', 240, async () => {
      const l = await json(await fetch(`${SHARE}/share/v1/links/${linkUid}`, { headers: H() }))
      return l.media_state === 'ready' ? l : undefined
    })
    assert(ready && ready.media_version && ready.duration_ms > 0, 'ready, with version and duration')

    console.log('== a viewer watches 60%')
    const secret = created.url.split('/s/')[1].split('.').slice(1).join('.')
    const claim = await json(await fetch(`${SHARE}/media/v1/${linkUid}/claim?k=${secret}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ email: 'owner-e2e-viewer@example.com', consent: true }) }))
    assert(typeof claim.session === 'string', 'claimed a session')
    const bits = '1'.repeat(60) + '0'.repeat(40)
    const raw = Buffer.from(BigInt('0b' + bits.padEnd(104, '0')).toString(16).padStart(26, '0'), 'hex')
    const b = await fetch(`${SHARE}/media/v1/${linkUid}/playback?t=${claim.session}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ buckets: 100, coverage: raw.toString('base64'), duration_ms: 4000,
                             furthest_ms: 2400, plays: 1, quality: 'hd' }) })
    assert(b.status === 200, 'beacon accepted')

    console.log('== what MediaLinkDetail reads')
    const aud: LinkAudience = await json(await fetch(`${SHARE}/share/v1/links/${linkUid}/audience`, { headers: H() }))
    const row = aud.audience[0]
    assert(row && ROW_FIELDS.every((k) => k in row), 'every roster field the component reads is present')
    assert(row.has_playback === true && row.coverage_bits.length === 100, 'coverage bitmap for the bar')
    assert(row.coverage_pct === 61 && row.dropoff_seconds === 2, 'server-computed coverage and drop-off')
    assert(row.verified === false && aud.unverified_note, 'claimed rows are unverified, with the note')
    assert(Array.isArray(aud.totals.retention) && typeof aud.tracking === 'boolean', 'totals and tracking flag')
    const csv = await fetch(`${SHARE}/share/v1/links/${linkUid}/audience.csv`, { headers: H() })
    // Bytes, not .text(): decoding strips the BOM, which is the thing to check.
    const bytes = new Uint8Array(await csv.arrayBuffer())
    const text = new TextDecoder().decode(bytes)
    assert(csv.status === 200 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      && text.includes('owner-e2e-viewer@example.com'), 'Export CSV: BOM, and the viewer')
    const flush = await fetch(`${SHARE}/share/v1/links/${linkUid}/audience/flush`, { method: 'POST', headers: H() })
    assert(flush.status === 200, 'Update audience.csv now')
  } finally {
    if (linkUid) await fetch(`${SHARE}/share/v1/links/${linkUid}`, { method: 'DELETE', headers: H() })
    if (fileUid) await fetch(`${BRIDGE}/v1/files/${fileUid}`, { method: 'DELETE', headers: H() })
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })

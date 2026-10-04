#!/usr/bin/env node
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
 * End-to-end: media really STREAMS — playback starts in a real browser before
 * the file has been transferred.
 *
 * Every other media test proves bytes and headers. This one proves the user-
 * visible property: a headless Chromium plays a <video>, on a throttled
 * network, and at the moment it fires `playing` it has received only a fraction
 * of the file. Measured from the browser's own network events (Chrome DevTools
 * Protocol), not inferred from the server. Then a seek to 80% must be served by
 * a later byte range, not by downloading everything before it.
 *
 * Two paths, the two the product has:
 *   1. the drawer   — the bridge's playback ticket on an uploaded file
 *                     (fileService.playbackUrl);
 *   2. the outsider — a media-door session on the PUBLISHED rendition
 *                     (share_service /media/v1, after csai encodes it).
 *
 *   FE_PASS=… node e2e/media-streaming.mjs
 * Env: FE_PASS (required); BRIDGE_URL, SHARE_URL, FE_USER, FE_TENANT,
 * MAILHOG_URL, THROTTLE_KBPS (default 4000 kbit/s), SKIP_DOOR=1.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const SHARE = process.env.SHARE_URL || 'http://localhost:8101'
const MAILHOG = process.env.MAILHOG_URL || 'http://localhost:8025'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS
const TENANT = process.env.FE_TENANT || 'default'
const KBPS = Number(process.env.THROTTLE_KBPS || 4000)
const ROOT = '00000000-0000-0000-0000-000000000000'
if (!PASS) { console.error('FE_PASS is required.'); process.exit(1) }

let passed = 0
let failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ✓', m) } else { failed++; console.error('  ✗', m) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let token = ''
const H = (x = {}) => ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...x })

async function login() {
  const basic = Buffer.from(`${USER}:${PASS}`).toString('base64')
  const first = await json(await fetch(`${BRIDGE}/v1/auth/token`, { method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'X-Tenant': TENANT } }))
  if (first?.token) return first.token
  const J = { 'Content-Type': 'application/json' }
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, action: 'send', method: 'email' }) })
  let code = ''
  for (let i = 0; i < 40 && !code; i++) {
    await sleep(250)
    const raw = (await json(await fetch(`${MAILHOG}/api/v2/messages`)))?.items?.[0]?.Content?.Body || ''
    code = (raw.replace(/=\r?\n/g, '').match(/\b(\d{6})\b/) || [])[1] || ''
  }
  const done = await json(await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, method: 'email', code }) }))
  return done.token
}

/**
 * Play `url` in a throttled headless Chromium and report what the browser had
 * received when playback began, and what a seek fetched.
 */
async function measure(browser, url, totalBytes, { viaBlob = false } = {}) {
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  // Throttled so a full download is slow enough to tell apart from a start.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 20,
    downloadThroughput: (KBPS * 1000) / 8, uploadThroughput: (KBPS * 1000) / 8,
  })
  const media = new Map()          // requestId -> {status, range, bytes}
  const key = url.split('?')[0]
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.request.url.split('?')[0] === key) {
      media.set(e.requestId, { status: 0, range: e.request.headers.Range || e.request.headers.range || '',
                               contentRange: '', bytes: 0 })
    }
  })
  cdp.on('Network.responseReceived', (e) => {
    const m = media.get(e.requestId)
    if (m) {
      m.status = e.response.status
      m.contentRange = e.response.headers['content-range'] || e.response.headers['Content-Range'] || ''
    }
  })
  cdp.on('Network.dataReceived', (e) => {
    const m = media.get(e.requestId)
    if (m) m.bytes += e.dataLength
  })
  // A whole-body fetch reports no dataReceived, only its final length here.
  cdp.on('Network.loadingFinished', (e) => {
    const m = media.get(e.requestId)
    if (m) m.bytes = Math.max(m.bytes, e.encodedDataLength || 0)
  })
  const received = () => [...media.values()].reduce((n, m) => n + m.bytes, 0)

  // Same origin as the media, so the control's fetch is not a CORS question
  // (the old drawer fetched from the app's own origin). A <video> needs no CORS.
  await page.goto(new URL(url).origin + '/__e2e_blank__').catch(() => {})
  await page.setContent('<video id="v" muted playsinline preload="auto"></video>')
  const t0 = Date.now()
  await page.evaluate((b) => { window.VIA_BLOB = b }, viaBlob)
  const started = page.evaluate((src) => new Promise((resolve, reject) => {
    const v = document.getElementById('v')
    const timer = setTimeout(() => reject(new Error(`no playback (readyState ${v.readyState}, error ${v.error?.code})`)), 60000)
    v.addEventListener('playing', () => {
      // Wait until the playhead is actually moving, not just "playing".
      const tick = () => (v.currentTime > 0.3
        ? (clearTimeout(timer), resolve({ duration: v.duration,
            bufferedEnd: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0 }))
        : setTimeout(tick, 50))
      tick()
    }, { once: true })
    v.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`media error ${v.error?.code}`)) })
    if (VIA_BLOB) {
      // The negative control: download it all, THEN play — what the drawer
      // did before playback tickets. The measurement must see ~100% here.
      fetch(src).then((r) => r.blob()).then((b) => {
        v.src = URL.createObjectURL(b)
        v.play().catch(() => {})
      }).catch(reject)
    } else {
      v.src = src
      v.play().catch(() => {})
    }
  }).then((x) => x), url)
  const at = await started
  const msToPlay = Date.now() - t0
  const bytesAtPlay = received()
  if (viaBlob) {
    await page.close()
    return { msToPlay, bytesAtPlay }
  }

  // Seek near the end: should be served by a range starting there, without
  // the browser first downloading everything in between.
  const seekFrom = received()
  const before = new Set(media.keys())
  const seeked = await page.evaluate(() => new Promise((resolve, reject) => {
    const v = document.getElementById('v')
    const timer = setTimeout(() => reject(new Error('seek never resumed')), 60000)
    const target = v.duration * 0.8
    v.addEventListener('seeked', () => {
      const tick = () => (v.currentTime > target + 0.2
        ? (clearTimeout(timer), resolve({ target, now: v.currentTime }))
        : setTimeout(tick, 50))
      tick()
    }, { once: true })
    v.currentTime = target
  }))
  const seekBytes = received() - seekFrom
  const seekRanges = [...media.entries()].filter(([id]) => !before.has(id)).map(([, m]) => m)
  await page.close()
  return { msToPlay, bytesAtPlay, at, seeked, seekBytes, seekRanges,
           requests: [...media.values()], fullDownloadMs: (totalBytes * 8) / KBPS }
}

function report(label, r, total) {
  const pct = (100 * r.bytesAtPlay) / total
  console.log(`    ${label}: playing after ${r.msToPlay} ms with ${(r.bytesAtPlay / 1e6).toFixed(2)} MB `
    + `of ${(total / 1e6).toFixed(2)} MB (${pct.toFixed(1)}%); a full download at ${KBPS} kbit/s `
    + `takes ~${Math.round(r.fullDownloadMs / 1000)} s`)
  assert(pct < 50, `${label}: playback started with under half the file received (${pct.toFixed(1)}%)`)
  assert(r.msToPlay < r.fullDownloadMs / 2, `${label}: started in well under the full-download time`)
  assert(r.at.bufferedEnd < r.at.duration, `${label}: the browser had NOT buffered to the end when it began`)
  assert(r.requests.some((m) => m.status === 206), `${label}: served as partial content (206)`)
  const later = r.seekRanges.filter((m) => m.status === 206 && /^bytes (\d+)-/.test(m.contentRange))
    .map((m) => Number(m.contentRange.match(/^bytes (\d+)-/)[1]))
  assert(later.some((start) => start > total * 0.5),
    `${label}: the seek to 80% was a range starting past the middle (${later.join(', ') || 'none'})`)
  assert(r.seekBytes < total * 0.5, `${label}: the seek did not download the skipped part`)
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'fe-stream-'))
  // 40 s of 720p VP9/Opus at ~3 Mbit/s: ~15 MB, several chunks — big enough
  // that "started" and "finished downloading" are seconds apart when throttled.
  const src = join(work, 'clip.webm')
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330',
    '-t', '40', '-c:v', 'libvpx-vp9', '-b:v', '3M', '-deadline', 'realtime', '-cpu-used', '8',
    '-g', '60', '-c:a', 'libopus', '-shortest', src])
  const total = statSync(src).size
  token = await login()
  const browser = await chromium.launch({ headless: true })
  let fileUid = ''
  let linkUid = ''
  try {
    fileUid = (await json(await fetch(`${BRIDGE}/v1/dirs/${ROOT}/files`, { method: 'POST',
      headers: H({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: `e2e-stream-${process.pid}.webm` }) }))).uid
    await fetch(`${BRIDGE}/v1/files/${fileUid}/content`, { method: 'PUT',
      headers: H({ 'Content-Type': 'application/octet-stream' }), body: readFileSync(src) })

    console.log('== 1. the drawer: a bridge playback ticket')
    const { ticket } = await json(await fetch(`${BRIDGE}/v1/files/${fileUid}/playback-ticket`,
      { method: 'POST', headers: H() }))
    const drawer = await measure(browser, `${BRIDGE}/v1/files/${fileUid}/content?ticket=${ticket}`, total)
    report('drawer', drawer, total)

    console.log('== 0. negative control: download it all, then play')
    const control = await measure(browser, `${BRIDGE}/v1/files/${fileUid}/content?ticket=${ticket}`,
                                  total, { viaBlob: true })
    const cpct = (100 * control.bytesAtPlay) / total
    console.log(`    control: playing after ${control.msToPlay} ms with ${cpct.toFixed(1)}% received`)
    assert(cpct > 95, 'the measurement tells buffering from streaming (control saw the whole file first)')
    assert(control.msToPlay > drawer.msToPlay * 10,
      `streaming started over 10× sooner than download-then-play (${drawer.msToPlay} vs ${control.msToPlay} ms)`)

    if (process.env.SKIP_DOOR !== '1') {
      console.log('== 2. an outside viewer: the media door, on the published rendition')
      const created = await json(await fetch(`${SHARE}/share/v1/nodes/${fileUid}/links`, {
        method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ kind: 3, access_mode: 'claimed', recipients: [], ttl_days: 1,
                               display_name: 'Streaming E2E' }) }))
      linkUid = created.link_uid
      const end = Date.now() + 300_000
      let link = created
      while (link.media_state !== 'ready' && Date.now() < end) {
        await sleep(3000)
        link = await json(await fetch(`${SHARE}/share/v1/links/${linkUid}`, { headers: H() }))
      }
      assert(link.media_state === 'ready', 'the rendition was published')
      const secret = created.url.split('/s/')[1].split('.').slice(1).join('.')
      const s = await json(await fetch(`${SHARE}/media/v1/${linkUid}/claim?k=${secret}`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ email: 'stream-e2e@example.com', consent: true }) }))
      const hd = s.sources.find((x) => x.quality === 'hd')
      const door = await measure(browser, `${SHARE}${hd.url}`, hd.bytes)
      report('media door', door, hd.bytes)
    }
  } finally {
    await browser.close()
    if (linkUid) await fetch(`${SHARE}/share/v1/links/${linkUid}`, { method: 'DELETE', headers: H() })
    if (fileUid) await fetch(`${BRIDGE}/v1/files/${fileUid}`, { method: 'DELETE', headers: H() })
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })

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
 * End-to-end: <fe-media-share> on a THIRD-PARTY host page (MEDIA_SHARE.md MS8).
 *
 * Two throwaway host origins — http://localhost:8790 (on the link's embed
 * allowlist) and http://127.0.0.1:8791 (not) — load the component exactly as an
 * integrator would: one script from the media origin, one element, no
 * <fe-session>. In a real Chromium:
 *   * a gated link is FRAMED; the gate is inside the frame; the host learns
 *     "identified" but never the address, and cannot reach the frame's DOM;
 *   * the host page's own fake postMessage is ignored;
 *   * frame-ancestors refuses the player on the non-allowlisted host, while the
 *     allowlisted host frames it (control);
 *   * an open link renders IN-PAGE in a closed shadow root, plays, beacons, and
 *     its session token is in no attribute, dataset or storage the host has;
 *   * oEmbed returns an iframe that frames on the allowlisted host.
 *
 * Needs the dev stack with SHARE_ALLOW_OPEN_MODE=true,
 * SHARE_MEDIA_EMBED_ALLOW_LOOPBACK=true, and the test user in share_public.
 *   FE_PASS=… node e2e/media-embed.mjs
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const SHARE = process.env.SHARE_URL || 'http://localhost:8101'
const MAILHOG = process.env.MAILHOG_URL || 'http://localhost:8025'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS
const TENANT = process.env.FE_TENANT || 'default'
const ROOT = '00000000-0000-0000-0000-000000000000'
const HOST_OK = 'http://localhost:8790'
const HOST_BAD = 'http://127.0.0.1:8791'
const HARNESS = join(dirname(fileURLToPath(import.meta.url)),
  '../../commercial_embedding/examples/host-harness/public/media.html')
if (!PASS) { console.error('FE_PASS is required.'); process.exit(1) }

let passed = 0
let failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ✓', m) } else { failed++; console.error('  ✗', m) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let token = ''
const H = (x = {}) => ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...x })
const JH = () => H({ 'Content-Type': 'application/json' })

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
  return (await json(await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, method: 'email', code }) }))).token
}

/** A tiny host: /media.html (the kit's harness page) and /raw?html=… */
function host(port, hostname) {
  const s = createServer((req, res) => {
    const u = new URL(req.url, `http://${hostname}:${port}`)
    if (u.pathname === '/media.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(readFileSync(HARNESS))
    }
    if (u.pathname === '/raw') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(u.searchParams.get('html') || '')
    }
    res.writeHead(404).end()
  })
  return new Promise((r) => s.listen(port, hostname, () => r(s)))
}

async function mint(fileUid, body) {
  const c = await json(await fetch(`${SHARE}/share/v1/nodes/${fileUid}/links`, { method: 'POST',
    headers: JH(), body: JSON.stringify({ kind: 3, ttl_days: 1, ...body }) }))
  if (!c.link_uid) throw new Error(`mint failed: ${JSON.stringify(c)}`)
  let l = c
  const end = Date.now() + 300_000
  while (l.media_state !== 'ready' && Date.now() < end) {
    await sleep(3000)
    l = await json(await fetch(`${SHARE}/share/v1/links/${c.link_uid}`, { headers: H() }))
  }
  const secret = c.url.split('/s/')[1].split('.').slice(1).join('.')
  return { ...c, ready: l.media_state === 'ready', secret,
           src: `${SHARE}/media/v1/${c.link_uid}?k=${encodeURIComponent(secret)}` }
}

const events = (page) => page.evaluate(() => window.__events || [])

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'fe-embed-'))
  const src = join(work, 'clip.mp4')
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '10', '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'aac',
    '-shortest', src])
  token = await login()
  const servers = [await host(8790, 'localhost'), await host(8791, '127.0.0.1')]
  const browser = await chromium.launch({ headless: true })
  let fileUid = ''
  const minted = []
  try {
    fileUid = (await json(await fetch(`${BRIDGE}/v1/dirs/${ROOT}/files`, { method: 'POST', headers: JH(),
      body: JSON.stringify({ name: `e2e-embed-${process.pid}.mp4` }) }))).uid
    await fetch(`${BRIDGE}/v1/files/${fileUid}/content`, { method: 'PUT',
      headers: H({ 'Content-Type': 'application/octet-stream' }), body: readFileSync(src) })

    console.log('== gated (claimed): framed, the gate inside the frame')
    const gated = await mint(fileUid, { access_mode: 'claimed', recipients: [], display_name: 'Embed E2E',
                                        allowed_embed_origins: [HOST_OK] })
    minted.push(gated.link_uid)
    assert(gated.ready, 'published')
    const page = await browser.newPage()
    await page.goto(`${HOST_OK}/media.html?src=${encodeURIComponent(gated.src)}`)
    await page.waitForFunction(() => document.querySelector('fe-media-share')?.rendering, null, { timeout: 30000 })
    assert(await page.evaluate(() => document.querySelector('fe-media-share').rendering) === 'iframe',
      'a gated link renders as a frame')
    assert(await page.evaluate(() => typeof document.querySelector('fe-session')) === 'object'
      && await page.evaluate(() => document.querySelector('fe-session')) === null, 'with no <fe-session> on the page')
    assert(await page.evaluate(() => document.querySelector('fe-media-share').shadowRoot) === null,
      'the host cannot reach the shadow root (closed)')
    let frame
    for (let i = 0; i < 50 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('/media/v1/player/')); if (!frame) await sleep(200) }
    assert(!!frame, 'the player page is framed from the media origin')
    await frame.waitForSelector('input[type="email"]', { timeout: 15000 })
    // The host's own forged message must be ignored.
    await page.evaluate(() => window.postMessage({ type: 'fe:media-identified' }, '*'))
    await sleep(300)
    assert(!(await events(page)).some((e) => e.type === 'fe:media-identified'),
      'a postMessage from the wrong origin is ignored')
    assert((await events(page)).some((e) => e.type === 'fe:media-gate'), 'the host learns a gate was shown')
    await frame.fill('input[type="email"]', 'embed-viewer@example.com')
    await frame.check('input[type="checkbox"]')
    await frame.click('button[type="submit"]')
    await frame.waitForSelector('video', { timeout: 15000 })
    const played = await frame.evaluate(() => new Promise((resolve) => {
      const v = document.querySelector('video'); v.muted = true; void v.play().catch(() => {})
      const t = () => (v.currentTime > 2 ? (v.pause(), resolve(v.currentTime)) : setTimeout(t, 100)); t()
    }))
    assert(played > 2, `the video played inside the frame (${played.toFixed(1)} s)`)
    const ev = await events(page)
    const ident = ev.find((e) => e.type === 'fe:media-identified')
    assert(!!ident && !JSON.stringify(ident).includes('embed-viewer'),
      'the host learns "identified" — never the address')
    assert(ev.some((e) => e.type === 'fe:media-play'), 'and that it is playing')
    await sleep(1500)
    const aud = await json(await fetch(`${SHARE}/share/v1/links/${gated.link_uid}/audience`, { headers: H() }))
    assert(aud.audience[0]?.email === 'embed-viewer@example.com' && aud.audience[0].has_playback,
      'the creator’s roster has the viewer, with playback')
    await page.close()

    console.log('== frame-ancestors: only the allowlisted host may frame the player')
    const player = `${SHARE}/media/v1/player/${gated.link_uid}?k=${encodeURIComponent(gated.secret)}`
    const tryFrame = async (origin) => {
      const p = await browser.newPage()
      await p.goto(`${origin}/raw?html=${encodeURIComponent(`<iframe src="${player}"></iframe>`)}`)
      await sleep(2500)
      const f = p.frames().find((x) => x !== p.mainFrame())
      const loaded = !!f && await f.evaluate(() => !!document.getElementById('app')).catch(() => false)
      await p.close()
      return loaded
    }
    assert(await tryFrame(HOST_OK), 'the allowlisted host frames it (control)')
    assert(!(await tryFrame(HOST_BAD)), 'a host NOT on the allowlist is refused by frame-ancestors')
    const badPage = await browser.newPage()
    await badPage.goto(`${HOST_BAD}/media.html?src=${encodeURIComponent(gated.src)}`)
    await sleep(2500)
    assert((await events(badPage)).some((e) => e.type === 'fe:media-error'),
      'the component on a non-allowlisted host gets nothing from the door (CORS) and says so')
    await badPage.close()

    console.log('== open: in-page, closed shadow root, token kept private')
    const open = await mint(fileUid, { access_mode: 'open', recipients: [], confirm_public: true,
                                       display_name: 'Open E2E', allowed_embed_origins: ['*'] })
    minted.push(open.link_uid)
    const p2 = await browser.newPage()
    const html = `<!doctype html><script type="module">
      window.__events = []
      const el = document.createElement('fe-media-share')
      el.setAttribute('src', ${JSON.stringify(open.src)})
      el.setAttribute('autoplay', 'true'); el.setAttribute('muted', 'true')
      for (const t of ['fe:media-ready','fe:media-play','fe:media-error']) el.addEventListener(t, (e) => window.__events.push({ type: t, detail: e.detail }))
      document.body.append(el)
      await import(${JSON.stringify(`${SHARE}/media/v1/embed/fe-media-share.js`)})
    </script>`
    await p2.goto(`${HOST_OK}/raw?html=${encodeURIComponent(html)}`)
    await p2.waitForFunction(() => (window.__events || []).some((e) => e.type === 'fe:media-play'), null, { timeout: 30000 })
    assert(await p2.evaluate(() => document.querySelector('fe-media-share').rendering) === 'inline',
      'an open link renders in-page')
    assert(p2.frames().length === 1, 'with no frame')
    await sleep(2500)
    await p2.evaluate(() => document.querySelector('fe-media-share').pause())
    await sleep(1500)
    // Every VALUE the host can read: attributes, dataset, both storages.
    const values = await p2.evaluate(() => {
      const el = document.querySelector('fe-media-share')
      return [...[...el.attributes].map((a) => a.value), ...Object.values({ ...el.dataset }),
              ...Object.values({ ...localStorage }), ...Object.values({ ...sessionStorage }),
              String(el.shadowRoot)]
    })
    const oa = await json(await fetch(`${SHARE}/share/v1/links/${open.link_uid}/audience`, { headers: H() }))
    assert(oa.totals.viewers === 1, 'the in-page viewing opened one session')
    // The link secret is in src by design (the host wrote it). A session token
    // (43 url-safe chars, or a t= parameter) must appear nowhere.
    const leaked = values.map((v) => String(v).split(open.secret).join(''))
      .filter((v) => /[?&]t=|[A-Za-z0-9_-]{40,}/.test(v))
    assert(leaked.length === 0 && values.at(-1) === 'null',
      `no session token in any attribute, dataset or storage the host can read (${leaked.length})`)
    await p2.close()

    console.log('== oEmbed: paste the URL, get a frame')
    const oe = await json(await fetch(`${SHARE}/media/v1/oembed?url=${encodeURIComponent(gated.src)}`))
    assert(oe.type === 'video' && /^<iframe /.test(oe.html || ''), 'oEmbed returns an iframe')
    const p3 = await browser.newPage()
    await p3.goto(`${HOST_OK}/raw?html=${encodeURIComponent(oe.html)}`)
    await sleep(2500)
    const of = p3.frames().find((x) => x !== p3.mainFrame())
    assert(!!of && await of.evaluate(() => !!document.getElementById('app')).catch(() => false),
      'which frames the player on an allowlisted host')
    await p3.close()
  } finally {
    await browser.close()
    for (const s of servers) s.close()
    for (const l of minted) await fetch(`${SHARE}/share/v1/links/${l}`, { method: 'DELETE', headers: H() })
    if (fileUid) await fetch(`${BRIDGE}/v1/files/${fileUid}`, { method: 'DELETE', headers: H() })
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })

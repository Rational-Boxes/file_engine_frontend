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
 * End-to-end: the preview's Extracted data tab, in a real browser, against the
 * live stack (bridge, csai with its chat model, Vite SPA).
 *
 * A two-page datasheet is uploaded, a prompt set is published and run on it
 * (csai writes the values and the marked-up PDF beside the source). Opened in
 * the overlay and on the preview page, the document must show the Preview &
 * comments / Extracted data tabs, open on Extracted data — the marked-up PDF,
 * read-only (no markup tools), the discussion hidden, the values beside it,
 * each with its page read from the PDF's highlights — and switch to the
 * annotatable document with its discussion. A second PDF that was never
 * extracted is the regression check: no tabs, toolbar and discussion as before.
 *
 *   FE_PASS=… node e2e/extraction-tab.mjs
 * Env: FE_PASS (required); APP_URL, BRIDGE_URL, CSAI_URL, FE_USER, FE_TENANT,
 * MAILHOG_URL; SHOTS (a directory for screenshots).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const APP = process.env.APP_URL || 'http://localhost:3000'
const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const CSAI = process.env.CSAI_URL || 'http://localhost:8092'
const MAILHOG = process.env.MAILHOG_URL || 'http://localhost:8025'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS
const TENANT = process.env.FE_TENANT || 'default'
const SHOTS = process.env.SHOTS || ''
const ROOT = '00000000-0000-0000-0000-000000000000'
if (!PASS) { console.error('FE_PASS is required.'); process.exit(1) }

let passed = 0
let failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ✓', m) } else { failed++; console.error('  ✗', m) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let token = ''
let expiresIn = 3600
const H = (x = {}) => ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...x })
const JH = (x = {}) => H({ 'Content-Type': 'application/json', ...x })

async function mailhogCode() {
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    const raw = (await json(await fetch(`${MAILHOG}/api/v2/messages`)))?.items?.[0]?.Content?.Body || ''
    const code = (raw.replace(/=\r?\n/g, '').match(/\b(\d{6})\b/) || [])[1]
    if (code) return code
  }
  return ''
}

async function login() {
  const basic = Buffer.from(`${USER}:${PASS}`).toString('base64')
  const first = await json(await fetch(`${BRIDGE}/v1/auth/token`, { method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'X-Tenant': TENANT } }))
  if (first?.token) { expiresIn = first.expires_in || expiresIn; return first.token }
  const J = { 'Content-Type': 'application/json' }
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, action: 'send', method: 'email' }) })
  const code = await mailhogCode()
  const done = await json(await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, method: 'email', code }) }))
  expiresIn = done.expires_in || expiresIn
  return done.token
}

/** A two-page datasheet: the width on page 1, the fire rating on page 2. */
function datasheet() {
  return execFileSync('python3', ['-c', `
import sys, pymupdf
d = pymupdf.open()
p = d.new_page(); p.insert_text((50, 80), "Door datasheet D-77", fontsize=14)
p.insert_text((50, 120), "Width", fontsize=11); p.insert_text((300, 120), "926 mm", fontsize=11)
p = d.new_page(); p.insert_text((50, 80), "Performance", fontsize=14)
p.insert_text((50, 120), "Fire resistance", fontsize=11); p.insert_text((300, 120), "EI 60", fontsize=11)
sys.stdout.buffer.write(d.tobytes())`], { maxBuffer: 1 << 24 })
}

async function upload(name, bytes) {
  const uid = (await json(await fetch(`${BRIDGE}/v1/dirs/${ROOT}/files`, { method: 'POST', headers: JH(),
    body: JSON.stringify({ name }) }))).uid
  await fetch(`${BRIDGE}/v1/files/${uid}/content`, { method: 'PUT',
    headers: H({ 'Content-Type': 'application/octet-stream' }), body: bytes })
  return uid
}

async function extract(uid, setId) {
  const end = Date.now() + 240_000
  let item = null
  while (Date.now() < end) {
    const r = await json(await fetch(`${CSAI}/v1/extract`, { method: 'POST',
      headers: JH({ Accept: 'application/json' }), body: JSON.stringify({ files: [uid], prompt_set: setId }) }))
    item = r?.items?.[0] || r
    if (!item?.skipped) return item
    await sleep(4000) // the ingest worker has not indexed the text yet
  }
  return item
}

async function page(browser) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await p.addInitScript(({ token, exp, tenant }) => {
    localStorage.setItem('fileengine_auth', JSON.stringify({ accessToken: token, refreshToken: '', expiresAt: exp }))
    localStorage.setItem('fileengine_tenant', tenant)
  }, { token, exp: Date.now() + expiresIn * 1000, tenant: TENANT })
  p.errors = []
  p.on('pageerror', (e) => p.errors.push(String(e)))
  return p
}

const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) }) }
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false)

/** The Extracted data tab, wherever the preview is mounted (overlay or page). */
async function checkExtracted(p, where) {
  await p.waitForSelector('[data-test="tab-extracted"]', { timeout: 30000 })
  assert((await p.getAttribute('[data-test="tab-extracted"]', 'aria-selected')) === 'true',
    `${where}: opens on the Extracted data tab`)
  assert((await p.textContent('[data-test="tab-document"]'))?.includes('Preview & comments'),
    `${where}: the other tab is Preview & comments`)
  assert((await p.locator('.dp-tabs [role="tab"]').count()) === 2, `${where}: exactly two tabs (no chat log)`)
  await p.waitForSelector('.xs-row', { timeout: 30000 })
  await p.waitForSelector('.pv-container .page', { timeout: 30000 })
  await p.waitForSelector('.xs-page', { timeout: 30000 }).catch(() => {})
  const rows = await p.$$eval('.xs-row', (els) => els.map((e) => ({
    field: e.getAttribute('data-field'), text: e.textContent || '',
    swatch: !!e.querySelector('.xs-swatch'), page: e.querySelector('.xs-page')?.textContent || '' })))
  const fire = rows.find((r) => r.field === 'fire_rating')
  const link = await p.$eval('.xs-page', (b) => {
    const st = getComputedStyle(b)
    return { fg: st.color, bg: st.backgroundColor }
  })
  assert(link.bg === 'rgba(0, 0, 0, 0)' && link.fg !== 'rgb(255, 255, 255)',
    `${where}: the page link reads as a link (${link.fg} on ${link.bg})`)
  const width = rows.find((r) => r.field === 'width_mm')
  assert(fire?.text.includes('EI 60'), `${where}: the fire rating is listed (EI 60)`)
  assert(width?.text.includes('926'), `${where}: the width is listed (926)`)
  assert(fire?.page === 'Page 2' && fire.swatch, `${where}: the fire rating links to page 2, with its colour`)
  assert(width?.page === 'Page 1', `${where}: the width links to page 1`)
  assert(rows.find((r) => r.field === 'epd_number')?.text.includes('Not found'), `${where}: a missing field says so`)
  assert(!(await visible(p, '.pv-toolbar-label')), `${where}: read-only, no markup tools`)
  assert(!(await visible(p, '.dp-discussion')), `${where}: the discussion is not on this tab`)
  // the PDF on screen is the marked-up copy (it has csai's highlight annotations)
  assert(await p.locator('.pv-container .annotationLayer section.highlightAnnotation, .pv-container .annotationLayer [data-annotation-id]').count() > 0,
    `${where}: the PDF shown carries the extraction's highlights`)
  await shot(p, `${where}-extracted`)
  const before = await p.$eval('.pv-container', (c) => c.scrollTop)
  await p.click('.xs-row[data-field="fire_rating"] .xs-page')
  await sleep(600)
  const after = await p.$eval('.pv-container', (c) => c.scrollTop)
  assert(after > before, `${where}: Page 2 scrolls the viewer to the highlight`)

  await p.click('[data-test="tab-document"]')
  await p.waitForSelector('.pv-toolbar-label', { timeout: 30000 }).catch(() => {})
  const rendered = await p.waitForSelector('.pv-container .page canvas', { timeout: 30000 })
    .then(() => true, () => false)
  assert(rendered, `${where}: Preview & comments renders the document`)
  assert(await p.locator('.pv-container .annotationLayer section.highlightAnnotation').count() === 0,
    `${where}: Preview & comments shows the original, not the marked-up copy`)
  assert(await visible(p, '.pv-toolbar-label'), `${where}: Preview & comments offers the markup tools`)
  assert(await visible(p, '.dp-discussion'), `${where}: Preview & comments shows the discussion`)
  assert(!(await visible(p, '.xs')), `${where}: no values sidebar on Preview & comments`)
  await shot(p, `${where}-document`)
  await p.click('[data-test="tab-extracted"]')
  await p.waitForSelector('.xs-row', { timeout: 30000 })
  assert(await visible(p, '.xs'), `${where}: back on Extracted data`)
}

async function main() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  token = await login()
  assert(!!token, 'signed in')
  const tag = `e2e-extract-${process.pid}`
  const pdf = datasheet()
  const files = []
  let setId = ''
  const browser = await chromium.launch({ headless: true })
  try {
    const uid = await upload(`${tag}.pdf`, pdf)
    const plain = await upload(`${tag}-plain.pdf`, pdf)
    files.push(uid, plain)

    console.log('== a prompt set, published and run on the datasheet')
    const made = await json(await fetch(`${CSAI}/v1/prompt-sets`, { method: 'POST', headers: JH(), body: JSON.stringify({
      name: `Door datasheet ${tag}`, instructions: 'Read the door datasheet.',
      fields: [{ name: 'fire_rating', type: 'string', label: 'Fire resistance' },
        { name: 'width_mm', type: 'number', label: 'Width', unit: 'mm' },
        { name: 'epd_number', type: 'string', label: 'EPD number' }] }) }))
    setId = made.id
    await fetch(`${CSAI}/v1/prompt-sets/${setId}/publish`, { method: 'POST', headers: H() })
    const item = await extract(uid, setId)
    if (!item?.valid) console.error('  extract answered:', JSON.stringify(item).slice(0, 600))
    assert(item?.valid && item?.data?.fire_rating?.found, `extraction ran (${JSON.stringify(item?.data?.fire_rating?.value)})`)
    assert(item?.markup?.status === 'written', `csai wrote the marked-up PDF (${item?.markup?.status})`)

    console.log('== the overlay, from the file browser')
    const p = await page(browser)
    await p.goto(`${APP}/files`)
    await p.waitForSelector(`tr[data-uid="${uid}"]`, { timeout: 30000 })
    await p.dblclick(`tr[data-uid="${uid}"]`)
    await checkExtracted(p, 'overlay')
    await p.keyboard.press('Escape')

    console.log('== regression: a PDF never extracted previews as before')
    await p.dblclick(`tr[data-uid="${plain}"]`)
    await p.waitForSelector('.pv-container .page', { timeout: 30000 })
    await p.waitForSelector('.pv-toolbar-label', { timeout: 30000 }).catch(() => {})
    assert(!(await visible(p, '.dp-tabs')), 'plain: no tabs')
    assert(await visible(p, '.pv-toolbar-label'), 'plain: the markup tools are offered')
    assert(await visible(p, '.dp-discussion'), 'plain: the discussion is shown')
    assert(!(await visible(p, '.xs')), 'plain: no values sidebar')
    await shot(p, 'overlay-plain')
    await p.keyboard.press('Escape')

    console.log('== the preview page')
    const q = await page(browser)
    await q.goto(`${APP}/preview/${uid}`)
    await checkExtracted(q, 'page')
    assert(p.errors.length === 0 && q.errors.length === 0,
      `no page errors${p.errors.length + q.errors.length ? `: ${[...p.errors, ...q.errors].join(' | ')}` : ''}`)
  } finally {
    await browser.close()
    for (const f of files) await fetch(`${BRIDGE}/v1/files/${f}`, { method: 'DELETE', headers: H() }).catch(() => {})
    if (setId) await fetch(`${CSAI}/v1/prompt-sets/${setId}/retire`, { method: 'POST', headers: JH(), body: '{}' }).catch(() => {})
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('E2E error:', e); process.exit(1) })

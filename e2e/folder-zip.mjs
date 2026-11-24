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
 * End-to-end: "Download as ZIP" in a real browser, against the live stack.
 *
 * A small tree is built over the API; the file browser is opened on it; the
 * toolbar button (the folder being viewed) and a subfolder's ⋮ menu item must
 * each produce a browser download, which Python's zipfile then checks for every
 * member's CRC and bytes. Then a SELECTION: two of the three items ticked, the
 * selection bar's "Download as ZIP" must give exactly those (the folder's
 * subtree included) in a ZIP named after the folder being viewed; with one item
 * ticked the button is not offered. The download must be a NAVIGATION the browser saves
 * itself — the page must never fetch the archive into memory — which is checked
 * by watching the page's own requests.
 *
 *   FE_PASS=… node e2e/folder-zip.mjs
 * Env: FE_PASS (required); APP_URL, BRIDGE_URL, FE_USER, FE_TENANT, MAILHOG_URL.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright-core'

const APP = process.env.APP_URL || 'http://localhost:3000'
const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const MAILHOG = process.env.MAILHOG_URL || 'http://localhost:8025'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS
const TENANT = process.env.FE_TENANT || 'default'
const ROOT = '00000000-0000-0000-0000-000000000000'
if (!PASS) { console.error('FE_PASS is required.'); process.exit(1) }

let passed = 0
let failed = 0
const assert = (c, m, extra = '') => {
  if (c) { passed++; console.log('  ✓', m) } else { failed++; console.error('  ✗', m, extra) }
}
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

const mkdir = async (parent, name) => (await json(await fetch(`${BRIDGE}/v1/dirs/${parent}`, {
  method: 'POST', headers: JH(), body: JSON.stringify({ name }) }))).uid

async function put(parent, name, bytes) {
  const uid = (await json(await fetch(`${BRIDGE}/v1/dirs/${parent}/files`, { method: 'POST',
    headers: JH(), body: JSON.stringify({ name }) }))).uid
  await fetch(`${BRIDGE}/v1/files/${uid}/content`, { method: 'PUT',
    headers: H({ 'Content-Type': 'application/octet-stream' }), body: bytes })
  return uid
}

/** zipfile's verdict on `zpath` against {path: localFile}: "OK" or a reason. */
function verify(zpath, expect) {
  const spec = join(work, `expect-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(spec, JSON.stringify(expect))
  return execFileSync('python3', ['-I', '-c', `
import sys, json, zipfile
z = zipfile.ZipFile(sys.argv[1]); want = json.load(open(sys.argv[2]))
bad = z.testzip()
if bad: print("CRC mismatch", bad); sys.exit()
names = set(z.namelist())
for p, src in want.items():
    if p not in names: print("missing", p, sorted(names)); sys.exit()
    if src and z.read(p) != open(src, "rb").read(): print("differs", p); sys.exit()
files = [n for n in names if not n.endswith("/")]
if len(files) != sum(1 for v in want.values() if v): print("unexpected", sorted(names)); sys.exit()
print("OK")`, zpath, spec]).toString().trim()
}

const work = mkdtempSync(join(tmpdir(), 'folder-zip-'))

async function main() {
  token = await login()
  assert(!!token, 'signed in')

  const name = `zip_ui_${Date.now()}`
  const top = await mkdir(ROOT, name)
  const sub = await mkdir(top, 'models')
  const big = randomBytes(3 * 1024 * 1024 + 7)
  const small = Buffer.from('cover sheet\n')
  writeFileSync(join(work, 'big.bin'), big)
  writeFileSync(join(work, 'cover.txt'), small)
  await put(top, 'cover.txt', small)
  await put(top, 'skip.txt', Buffer.from('not selected\n'))
  writeFileSync(join(work, 'skip.txt'), 'not selected\n')
  await put(sub, 'big.bin', big)
  assert(!!top && !!sub, `tree built (${name})`)

  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } })
    await ctx.addInitScript(({ token, exp, tenant }) => {
      localStorage.setItem('fileengine_auth', JSON.stringify({ accessToken: token, refreshToken: '', expiresAt: exp }))
      localStorage.setItem('fileengine_tenant', tenant)
    }, { token, exp: Date.now() + expiresIn * 1000, tenant: TENANT })
    const p = await ctx.newPage()
    const errors = []
    p.on('pageerror', (e) => errors.push(String(e)))
    // Any XHR/fetch for the archive itself would mean the tab buffered it.
    const xhrArchive = []
    p.on('request', (r) => {
      if (/\/dirs\/[^/]+\/archive(\?|$)/.test(r.url()) && ['xhr', 'fetch'].includes(r.resourceType()))
        xhrArchive.push(r.url())
    })

    await p.goto(`${APP}/files?folder=${top}`)
    const btn = p.locator('[data-test="download-folder-zip"]')
    await btn.waitFor({ timeout: 30000 })
    await p.locator('tr', { hasText: 'models' }).first().waitFor({ timeout: 30000 })
    assert(await btn.isVisible(), 'toolbar shows "Download as ZIP"')

    const [d1] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), btn.click()])
    const f1 = join(work, 'toolbar.zip')
    await d1.saveAs(f1)
    assert(d1.suggestedFilename() === `${name}.zip`, `toolbar download is named ${name}.zip`, d1.suggestedFilename())
    const v1 = verify(f1, { 'cover.txt': join(work, 'cover.txt'), 'skip.txt': join(work, 'skip.txt'),
      'models/big.bin': join(work, 'big.bin') })
    assert(v1 === 'OK', 'toolbar ZIP holds the whole tree, CRC-valid and byte-identical', v1)

    // The subfolder's ⋮ menu.
    const row = p.locator('tr', { hasText: 'models' }).first()
    await row.locator('.kebab-btn').click()
    const item = p.locator('.kebab-item', { hasText: 'Download as ZIP' })
    assert(await item.isVisible(), 'a folder row\'s ⋮ menu offers "Download as ZIP"')
    const [d2] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), item.click()])
    const f2 = join(work, 'row.zip')
    await d2.saveAs(f2)
    assert(d2.suggestedFilename() === 'models.zip', 'row download is named models.zip', d2.suggestedFilename())
    const v2 = verify(f2, { 'big.bin': join(work, 'big.bin') })
    assert(v2 === 'OK', 'row ZIP holds just that subfolder', v2)

    // A file row must NOT offer it.
    await p.keyboard.press('Escape')
    const frow = p.locator('tr', { hasText: 'cover.txt' }).first()
    await frow.locator('.kebab-btn').click()
    assert(!(await p.locator('.kebab-item', { hasText: 'Download as ZIP' }).isVisible()),
      'a file row\'s ⋮ menu does not offer it')

    // Selected items.
    await p.keyboard.press('Escape')
    const tick = (name) => p.locator('tr', { hasText: name }).first().locator('td.cb-col input[type=checkbox]').check()
    const selBtn = p.locator('[data-test="download-selection-zip"]')
    await tick('cover.txt')
    await p.locator('.selbar').waitFor({ timeout: 10000 })
    assert(!(await selBtn.isVisible()), 'one item ticked: the selection bar does not offer a ZIP')
    await tick('models')
    await selBtn.waitFor({ timeout: 10000 })
    assert(await selBtn.isVisible(), 'two items ticked: the selection bar offers "Download as ZIP"')
    const urlBefore = p.url()
    const [d3] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), selBtn.click()])
    const f3 = join(work, 'selection.zip')
    await d3.saveAs(f3)
    assert(d3.suggestedFilename() === `${name}.zip`, `selection download is named after the folder (${name}.zip)`, d3.suggestedFilename())
    const v3 = verify(f3, { 'cover.txt': join(work, 'cover.txt'), 'models/big.bin': join(work, 'big.bin') })
    assert(v3 === 'OK', 'selection ZIP holds exactly the ticked items (folder subtree included)', v3)
    assert(p.url() === urlBefore && await p.locator('.selbar').isVisible(),
      'the page stayed put and the selection is kept', p.url())

    assert(xhrArchive.length === 0, 'the archive was a navigation, never fetched into the tab', xhrArchive.join(' '))
    assert(errors.length === 0, 'no page errors', errors.join(' | '))
  } finally {
    await browser.close()
    await fetch(`${BRIDGE}/v1/dirs/${top}`, { method: 'DELETE', headers: H() }).catch(() => {})
  }
}

main()
  .catch((e) => { failed++; console.error('  ✗ crashed:', e) })
  .finally(() => {
    rmSync(work, { recursive: true, force: true })
    console.log(`\npassed ${passed}, failed ${failed}`)
    process.exit(failed ? 1 : 0)
  })

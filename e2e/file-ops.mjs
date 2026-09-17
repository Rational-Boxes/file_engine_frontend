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
 * End-to-end test for the file operations the SPA relies on, driven against the
 * live http_bridge REST API (the same endpoints fileService uses). Covers the
 * cut/copy/paste + batch-delete + versions behaviour, including the regression
 * where a versioned copy must preserve history and current = latest version.
 *
 * Also covers the inline TEXT EDITOR (read as text, save back as a new version,
 * UTF-8 round trip) and "New document here" (the file browser's inline document
 * creation):
 * a zero-byte touch with an office extension, de-duplicated naming, and that
 * ONLYOFFICE issues an editor config for the result — the editor assertions skip
 * cleanly when CSAI is absent or in-browser editing is switched off.
 *
 * Run against a running stack (core + http_bridge; csai for the editor part):
 *   node e2e/file-ops.mjs
 * Env: FE_PASS is required (no hardcoded default); BRIDGE_URL, CSAI_URL, FE_USER
 * and FE_TENANT have local-dev defaults.
 */
const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS
const TENANT = process.env.FE_TENANT || 'default'
// CSAI owns the ONLYOFFICE editor config; the "New document here" flow is only
// real if a zero-byte touched file is something the editor will open.
const CSAI = process.env.CSAI_URL || 'http://localhost:8092'
// Where the emailed 2FA code is read from when the tenant requires 2FA. Same
// MailHog seam scripts/test_e2e_service_cred.sh and webdav_bridge/test_webdav.sh
// already use, so the test user works whether or not they are enrolled.
const MAILHOG = process.env.MAILHOG_URL || 'http://localhost:8025'
const ROOT = '00000000-0000-0000-0000-000000000000'

if (!PASS) {
  console.error('FE_PASS is required (the LDAP test-user password); set it in the environment.')
  process.exit(1)
}

let token
const H = (extra = {}) => ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...extra })
let passed = 0
let failed = 0
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('  ✓', msg) } else { failed++; console.error('  ✗', msg) }
}
const body = (o) => ({ headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify(o) })
const j = async (res) => { const t = await res.text(); try { return JSON.parse(t) } catch { return t } }

// Password login, completing an email-2FA challenge when the tenant requires one.
// Without this the whole suite is unrunnable against any tenant with 2FA on — the
// token endpoint answers `mfa_required` and there is no session to test with.
const twoFactor = async (mfaToken) => {
  const send = { 'Content-Type': 'application/json' }
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  await fetch(`${BRIDGE}/v1/auth/2fa`, {
    method: 'POST', headers: send,
    body: JSON.stringify({ mfa_token: mfaToken, action: 'send', method: 'email' }),
  })
  // The mail is sent asynchronously; poll briefly rather than sleeping a fixed
  // amount, so a slow SMTP hop does not look like a missing code.
  let code = ''
  for (let i = 0; i < 20 && !code; i++) {
    await new Promise((r) => setTimeout(r, 250))
    const box = await j(await fetch(`${MAILHOG}/api/v2/messages`))
    const raw = box?.items?.[0]?.Content?.Body || ''
    // Quoted-printable soft line breaks would split a code across lines.
    const body = raw.replace(/=\r?\n/g, '')
    code = (body.match(/\b(\d{6})\b/) || [])[1] || ''
  }
  if (!code) {
    // Almost always the send cap (3 per 15 min per user) after repeated runs —
    // which presented as a bare "login failed" and cost real time to diagnose.
    throw new Error(
      'no emailed 2FA code arrived — either MailHog is not running, or the ' +
      'code-send rate limit is in effect (wait a few minutes between runs)',
    )
  }
  const done = await j(await fetch(`${BRIDGE}/v1/auth/2fa`, {
    method: 'POST', headers: send,
    body: JSON.stringify({ mfa_token: mfaToken, method: 'email', code }),
  }))
  return done.token
}

const login = async () => {
  const res = await fetch(`${BRIDGE}/v1/auth/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64'), 'X-Tenant': TENANT },
  })
  const out = await j(res)
  token = out.mfa_required ? await twoFactor(out.mfa_token) : out.token
  if (!token) throw new Error(`login failed for ${USER}`)
}
const mkdir = async (parent, name) => (await j(await fetch(`${BRIDGE}/v1/dirs/${parent}`, { method: 'POST', ...body({ name }) }))).uid
const touch = async (parent, name) => (await j(await fetch(`${BRIDGE}/v1/dirs/${parent}/files`, { method: 'POST', ...body({ name }) }))).uid
const put = (uid, data) => fetch(`${BRIDGE}/v1/files/${uid}/content`, { method: 'PUT', headers: H({ 'Content-Type': 'text/plain' }), body: data })
const content = async (uid) => (await fetch(`${BRIDGE}/v1/files/${uid}/content`, { headers: H() })).text()
const versions = async (uid) => (await j(await fetch(`${BRIDGE}/v1/files/${uid}/versions`, { headers: H() }))).versions || []
const listDir = async (uid) => (await j(await fetch(`${BRIDGE}/v1/dirs/${uid}`, { headers: H() }))).entries || []
const copy = (uid, dest) => fetch(`${BRIDGE}/v1/nodes/${uid}/copy`, { method: 'POST', ...body({ destination_parent_uid: dest }) })
const move = (uid, dest) => fetch(`${BRIDGE}/v1/nodes/${uid}/move`, { method: 'POST', ...body({ destination_parent_uid: dest }) })
const rm = (uid, isDir) => fetch(`${BRIDGE}/v1/${isDir ? 'dirs' : 'files'}/${uid}`, { method: 'DELETE', headers: H() })
const entry = async (parent, name) => (await listDir(parent)).find((e) => e.name === name)
// What the SPA's fileService.createEmptyFile does: touch, then write an EMPTY
// body. The touch alone leaves a node with no version, whose bytes endpoint
// 404s — which the Document Server hits before it can open anything.
// What the text editor's Save does: PUT the edited characters back as UTF-8.
const putText = (uid, text) => fetch(`${BRIDGE}/v1/files/${uid}/content`, {
  method: 'PUT', headers: H({ 'Content-Type': 'text/plain; charset=utf-8' }), body: text,
})
const createEmpty = async (parent, name) => {
  const uid = await touch(parent, name)
  await fetch(`${BRIDGE}/v1/files/${uid}/content`, {
    method: 'PUT', headers: H({ 'Content-Type': 'application/octet-stream' }), body: '',
  })
  return uid
}
// CSAI accepts the bridge's bearer token (bridge introspection), so the session
// we already hold works here too.
const editorConfig = (uid) =>
  fetch(`${CSAI}/v1/onlyoffice/config/${uid}`, { headers: H() }).catch(() => null)

// Mirrors utils/office.ts uniqueDocumentName — the SPA de-duplicates the name
// client-side before touching, so the E2E has to create the same names the UI
// would in order to be testing the same thing.
const uniqueDocumentName = (taken, base, ext) => {
  const used = new Set(taken.map((n) => n.toLowerCase()))
  const stem = (base || '').trim() || 'Document'
  const candidate = (n) => (n === 1 ? `${stem}.${ext}` : `${stem} (${n}).${ext}`)
  let n = 1
  while (used.has(candidate(n).toLowerCase())) n++
  return candidate(n)
}

async function main() {
  await login()
  const work = await mkdir(ROOT, `e2e-fileops-${Date.now()}`)
  const dst = await mkdir(work, 'dst')

  console.log('copy preserves version history + current = latest')
  const vf = await touch(work, 'versioned.txt')
  for (const v of ['v1-one', 'v2-two', 'v3-three']) await put(vf, v)
  assert((await versions(vf)).length === 3, 'source has 3 versions')
  await copy(vf, dst)
  const vcopy = (await listDir(dst)).find((e) => e.name === 'versioned.txt')
  assert(!!vcopy, 'copy exists in destination')
  assert((await versions(vcopy.uid)).length === 3, 'copy preserves all 3 versions (history)')
  assert((await content(vcopy.uid)) === 'v3-three', 'copy current content is the LATEST version')
  const cv = await versions(vcopy.uid)
  const oldest = cv[cv.length - 1]
  const oldBlob = await (await fetch(`${BRIDGE}/v1/files/${vcopy.uid}/versions/${encodeURIComponent(oldest)}`, { headers: H() })).text()
  assert(oldBlob === 'v1-one', 'an older version of the copy is intact')

  console.log('single-version copy (the non-versioned baseline)')
  const sf = await touch(work, 'single.txt'); await put(sf, 'only-content')
  await copy(sf, dst)
  const scopy = (await listDir(dst)).find((e) => e.name === 'single.txt')
  assert(scopy && (await content(scopy.uid)) === 'only-content', 'single-version copy has correct content')

  console.log('move (cut) relocates the node')
  const mf = await touch(work, 'mover.txt'); await put(mf, 'moved')
  await move(mf, dst)
  assert((await listDir(dst)).some((e) => e.uid === mf), 'moved file is in the destination')
  assert(!(await listDir(work)).some((e) => e.uid === mf), 'moved file is gone from the source')

  console.log('batch delete')
  const d1 = await touch(work, 'del1.txt'); const d2 = await touch(work, 'del2.txt')
  await rm(d1, false); await rm(d2, false)
  assert(!(await listDir(work)).some((e) => e.uid === d1 || e.uid === d2), 'batch-deleted files are gone')

  console.log('name collisions auto-rename with a number suffix')
  const cf = await touch(work, 'dup.txt'); await put(cf, 'orig')
  await copy(cf, work) // copy into the SAME folder
  const dupNames = (await listDir(work)).map((e) => e.name).filter((n) => n.startsWith('dup'))
  assert(dupNames.includes('dup.txt') && dupNames.includes('dup (1).txt'),
    'copy into the same folder yields "dup (1).txt" (no duplicate name)')

  console.log('external add (upload) of a same-named file adds a NEW VERSION (contrast: copy renames)')
  const uf = await touch(work, 'upload.txt'); await put(uf, 'u1')
  // the upload service resolves the existing file by name, then PUTs a new version
  const existing = (await listDir(work)).find((e) => e.name === 'upload.txt' && e.type !== 'directory')
  assert(existing && existing.uid === uf, 'find-by-name resolves the existing file')
  await put(existing.uid, 'u2')
  assert((await listDir(work)).filter((e) => e.name === 'upload.txt').length === 1, 're-upload does not duplicate')
  assert((await versions(existing.uid)).length === 2, 're-upload adds a new version')
  assert((await content(existing.uid)) === 'u2', 're-upload updates the current content')

  // --- "New document here" -------------------------------------------------
  // The whole feature is: touch a name with an office extension, then open it in
  // ONLYOFFICE. There is no template and no upload, so what has to hold is that
  // a ZERO-BYTE node is created, that a second one does not version onto the
  // first, and that the editor will actually open it.
  console.log('new document: touch creates an empty, editable office document')
  const docs = await mkdir(work, 'newdocs')
  const n1 = uniqueDocumentName([], 'Document', 'docx')
  assert(n1 === 'Document.docx', 'first new document is named "Document.docx"')
  const doc1 = await createEmpty(docs, n1)
  const e1 = await entry(docs, n1)
  assert(!!doc1 && !!e1, 'the document node was created')
  assert(e1.size === 0, 'the new document is zero bytes (no template, no upload)')
  // The regression this guards: a touch with no PUT leaves NO version, so the
  // bytes 404 and the editor cannot open the file it was just handed.
  const bytes = await fetch(`${BRIDGE}/v1/files/${doc1}/content`, { headers: H() })
  assert(bytes.status === 200, 'its bytes are served (an empty first version exists, not just a node)')
  assert((await bytes.text()) === '', 'and they read back empty')
  assert((await versions(doc1)).length === 1, 'exactly one (empty) version to start from')

  console.log('new document: a second one is a NEW FILE, never a new version')
  const taken = (await listDir(docs)).map((e) => e.name)
  const n2 = uniqueDocumentName(taken, 'Document', 'docx')
  assert(n2 === 'Document (2).docx', 'the second is de-duplicated to "Document (2).docx"')
  const doc2 = await createEmpty(docs, n2)
  assert(doc2 !== doc1, 'the second document is a distinct node')
  assert((await listDir(docs)).filter((e) => e.type !== 'directory').length === 2,
    'two documents exist (creating never versions onto an existing file — contrast the upload case above)')
  assert((await versions(doc1)).length === 1, 'the first document gained no version from the second')

  console.log('new document: ONLYOFFICE opens the empty file')
  const sheet = await createEmpty(docs, 'Spreadsheet.xlsx')
  const deck = await createEmpty(docs, 'Presentation.pptx')
  const cfgRes = await editorConfig(doc1)
  // A 404 here is ambiguous and must not be read as "disabled": the endpoint
  // answers 404 both when editing is switched off AND when its own stat of the
  // file failed (e.g. CSAI cannot reach the core). Only the first is a reason to
  // skip; the second is exactly the breakage this block exists to catch, so it
  // is distinguished by the detail rather than by the status alone.
  const cfgDetail = cfgRes && cfgRes.status === 404 ? String((await j(cfgRes.clone())).detail || '') : ''
  const editingOff = cfgDetail.includes('disabled')
  if (!cfgRes) {
    console.log('  – CSAI unreachable at', CSAI, '— skipping editor assertions')
  } else if (editingOff) {
    console.log('  – in-browser editing is disabled on this deployment — skipping editor assertions')
  } else {
    assert(cfgRes.status !== 404, `editor config did not 404 on a lookup failure (${cfgDetail || 'no detail'})`)
    assert(cfgRes.status === 200, 'editor config is issued for a zero-byte .docx')
    const cfg = (await j(cfgRes)).config || {}
    assert(cfg.documentType === 'word', 'it opens in the word editor')
    assert(cfg.document && cfg.document.fileType === 'docx', 'the editor is told the file type is docx')
    assert(!!(cfg.document && cfg.document.url), 'the config carries a download URL for the Document Server')
    // The Document Server fetches those bytes next; an empty body is the point.
    //
    // Fetched from CSAI's own origin rather than from the URL verbatim: that URL
    // carries CSAI_ONLYOFFICE_CALLBACK_BASE, which is the PUBLIC address the
    // Document Server reaches back on (an ngrok tunnel in dev). Whether that
    // tunnel is up is a deployment question; what this test is about is whether
    // CSAI serves the bytes for a scoped download token, so keep the token and
    // the path and swap the origin.
    const dlPath = new URL(cfg.document.url).pathname.replace(/^\/csai/, '')
    const dlQuery = new URL(cfg.document.url).search
    const dl = await fetch(`${CSAI}${dlPath}${dlQuery}`)
    assert(dl.status === 200, 'the scoped download token serves the empty document')
    assert((await dl.arrayBuffer()).byteLength === 0, 'it serves zero bytes, which the editor opens as a blank document')
    const sheetCfg = (await j(await editorConfig(sheet))).config || {}
    const deckCfg = (await j(await editorConfig(deck))).config || {}
    assert(sheetCfg.documentType === 'cell', 'an empty .xlsx opens in the spreadsheet editor')
    assert(deckCfg.documentType === 'slide', 'an empty .pptx opens in the presentation editor')
    // The menu only offers office types; anything else must be refused rather
    // than opening an editor that cannot save.
    const notOffice = await createEmpty(docs, 'notes.zip')
    assert((await editorConfig(notOffice)).status === 415, 'a non-office file is refused (415), not offered an editor')
  }

  // --- the inline text editor ---------------------------------------------
  // The editor is a textarea over two calls: read the bytes as text, PUT the
  // edited text back. What has to hold at this layer is that the round trip is
  // LOSSLESS and that saving versions rather than overwrites — a text editor
  // that silently mangles a file, or loses its history, is worse than none.
  console.log('text editor: round-trips content and versions on save')
  const tdir = await mkdir(work, 'textedit')
  const tf = await createEmpty(tdir, 'config.yaml')
  assert((await content(tf)) === '', 'a new text file starts empty')

  // Save #1 — what the editor does with the first typed content.
  const v1 = 'key: value\nlist:\n  - one\n'
  await putText(tf, v1)
  assert((await content(tf)) === v1, 'saved text reads back byte-for-byte')

  // Save #2 — editing again must ADD a version, never replace the first.
  const v2 = 'key: changed\nlist:\n  - one\n  - two\n'
  await putText(tf, v2)
  const tv = await versions(tf)
  assert(tv.length === 3, 'each save is a new version (empty + two edits)')
  assert((await content(tf)) === v2, 'current content is the latest save')
  const firstEdit = await (await fetch(
    `${BRIDGE}/v1/files/${tf}/versions/${encodeURIComponent(tv[1])}`, { headers: H() })).text()
  assert(firstEdit === v1, 'the previous save is still retrievable in full')

  // Non-ASCII and newlines are where a naive text round trip breaks: the editor
  // writes a UTF-8 Blob, so multi-byte characters must survive exactly.
  const utf8 = 'greeting: caf\u00e9 \u2014 \u65e5\u672c\u8a9e\nemoji: \u2713\n'
  await putText(tf, utf8)
  assert((await content(tf)) === utf8, 'multi-byte UTF-8 survives the round trip unchanged')

  // An empty save is a legitimate edit (clearing a file), not a no-op to skip.
  await putText(tf, '')
  assert((await content(tf)) === '', 'clearing the file is a save like any other')
  // 5 = the empty create, three edits, and this clear. Measured, not reasoned:
  // the question worth pinning is whether an EMPTY save versions at all, since
  // if it did not, clearing a file would be the one edit you could not undo.
  assert((await versions(tf)).length === 5, 'and it too is a version, so it can be undone')

  console.log('text editor: the menu entry creates a .txt the editor can open')
  const nf = await createEmpty(tdir, 'Notes.txt')
  const nfEntry = await entry(tdir, 'Notes.txt')
  assert(nfEntry && nfEntry.size === 0, 'New document → Text file creates an empty .txt')
  await putText(nf, 'first line\n')
  assert((await content(nf)) === 'first line\n', 'and it saves like any other text file')

  await rm(work, true) // cleanup
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('E2E error:', e); process.exit(1) })

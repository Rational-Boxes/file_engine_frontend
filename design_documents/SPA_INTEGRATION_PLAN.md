# SPA Integration Plan — Advanced FileEngine Features

Bringing the advanced capabilities shipped across the stack into the Vue 3 SPA:
the **ACL editor with principal type-ahead**, **role management**, **versioning +
metadata**, **document previews/renditions** (icon, first-page preview, inline
PDF), and the **convert_search_ai** features — **semantic + full-text search** and
**RAG chat** with citations.

The SPA stays a **pure client**: no backend of its own. It now talks to **two**
services — the HTTP bridge (`http_bridge`, REST) and conversion/search/AI
(`convert_search_ai`, REST + WebSocket).

```
                       ┌─ REST  /v1/*  ──▶ http_bridge ──gRPC──▶ FileEngine core
Browser (this SPA) ────┤
  Vue 3 · Pinia · axios └─ REST /search,/documents · WS /chat ──▶ convert_search_ai
                                                                     │ pgvector + Ollama/Claude
```

---

## 1. Current state (baseline)

- **Stack:** Vue 3 + TypeScript, Pinia, vue-router, axios, Vite, Vitest.
- **Done:** OAuth + LDAP login, tenant selector, file browser (navigate, mkdir,
  upload w/ progress, download, rename, delete), role-aware access from
  `/v1/whoami`. `FileItem` already carries `renditionCount`/`hasRenditions` and
  `fileService.listRenditions()` exists — the rendition hooks are half-wired.
- **Not built yet:** versioning, metadata, ACL/permissions, role management,
  admin, and **everything from convert_search_ai** (no client for it at all).
- **Single API client:** `services/apiClient.ts` (axios → `VITE_API_BASE`, Bearer
  + `X-Tenant` interceptors, 401 → `/login`).

---

## 2. Cross-cutting foundations (do first)

These unblock every feature workstream.

### 2.1 Second service client — `services/csaiClient.ts`
A second axios instance for convert_search_ai (`VITE_CSAI_BASE`, default
`http://localhost:8092`), mirroring `apiClient` (Bearer + `X-Tenant`, `401 →
clear+login`, `errorMessage`). Add a small **WebSocket helper** for `/chat`
(token passed as `?token=` query param, per the service's WS contract).

`.env` additions:
```ini
VITE_CSAI_BASE=http://localhost:8092
```

### 2.2 Auth across two services — single token (RESOLVED)
**The dual-token problem is solved on the backend.** The bridge is now the
upstream token authority: convert_search_ai accepts a bridge-issued bearer token
by introspecting it against the bridge's `GET /v1/auth/introspect` (enabled via
`CSAI_BRIDGE_URL`, cached briefly). One token — minted by **LDAP or OAuth** at
the bridge — authenticates against **both** services.

Frontend implications (much simpler than originally planned):

- **One token.** The SPA keeps using the single bridge token from
  `authService` for both `apiClient` (bridge) and `csaiClient` (CSAI). No second
  login, no `csai` token slot, no OAuth gap — OAuth users get AI features too.
- **`csaiClient` just sends the same `Authorization: Bearer` + `X-Tenant`.** A
  `401` from CSAI degrades the AI panels (search/chat) but must **not** bounce
  the whole app to `/login` — the bridge session may still be valid (and vice
  versa).
- **Deployment note:** CSAI must have `CSAI_BRIDGE_URL` pointed at the bridge,
  and both services' CORS must allow the SPA origin (incl. the `/chat` WS).

### 2.3 Shared types & helpers
- `types/` for cross-feature shapes (`Principal`, `AclEntry`, `Version`,
  `SearchHit`, `Citation`, `ChatEvent`).
- `services/renditions.ts` — parse rendition children into a typed set
  (`{ thumbnail?, preview?, pdf? }`) from their names (`<version>-<fmt>.<ext>`)
  and expose content URLs (see §4).

---

## 3. Workstream A — ACL & permissions editor (headline feature)

The motivation for the new `/v1/principals` endpoint. Lives in (or beside) the
existing `FileDetailsDrawer.vue` as a "Permissions" tab/modal.

- **`services/aclService.ts`** — ✅ **implemented** (`searchPrincipals` +
  `suggestionsToPrincipals`).
  - `searchPrincipals(q, {types?, limit?})` → `GET /v1/principals?q=&types=role,claim,user&limit=`
    returning `{ users, roles, claims }`. ✅
  - `grant` / `revoke` / point-`check` already live on `fileService`
    (`POST`/`DELETE`/`GET /v1/nodes/{uid}/permissions`). ✅
  - `getAcls(uid)` (list a node's ACL entries) — **backend dependency:** the core
    exposes only Grant/Revoke/Check/GetEffective, not a "list ACLs for resource"
    RPC (the DB has `get_acls_for_resource`, unexposed). Needs a core RPC +
    bridge `GET /v1/nodes/{uid}/acls` before the editor can show existing grants.
- **`components/PrincipalPicker.vue`** — ✅ **implemented**: debounced type-ahead
  (race-guarded) that calls `searchPrincipals`, renders the three categories
  (user / role / `key=value` claim) with distinct badges, and emits the chosen
  typed `Principal`. `encodePrincipal()` (in `types/`) maps it to the bridge wire
  form (bare user, `role:NAME`, `claim:key=value`).
- **`components/AclEditor.vue`** — lists current ACLs (principal · permission
  bits · ALLOW/DENY), supports add (via `PrincipalPicker`) and revoke, shows
  DENY-overrides-ALLOW precedence, and a "check access" probe
  (`GET …/permissions?user=&permission=&roles=`).
- **Gating:** only show the editor when the user holds MANAGE_ACL on the node
  (derive from `/v1/whoami` role + a permission check).
- **Pinia:** `stores/acl.ts` (per-node ACL cache, principal-search cache).

## 4. Workstream B — Document previews & inline viewer (renditions)

Surfaces the new rendition set (icon `thumbnail`, larger `preview`, inline `pdf`).

- Renditions are **hidden children** of a file; list with
  `fileService.listRenditions(uid)` (already present), fetch each rendition's
  bytes via `GET /v1/files/{childUid}/content` (auth'd; use a blob URL).
- **`services/renditions.ts`** maps children by name suffix → `{ thumbnail,
  preview, pdf }` (latest source version wins).
- **Browser grid:** when `hasRenditions`, lazy-load the `thumbnail` as the tile
  image (fallback to a type icon). Avoid N+1 by fetching renditions only for the
  visible page / on hover.
- **`components/PreviewModal.vue` — progressive, fetch-on-demand:** click a file
  → show the larger **`preview` image** (one small PNG). The full **`pdf` is NOT
  fetched at this point** — only the cheap preview image is. The `pdf` rendition
  (or a native PDF source) is loaded **only when the user explicitly asks for it**
  — clicking the large preview image (or an explicit "View document" / "Open PDF"
  control) — at which point we fetch the `pdf` bytes and embed the **inline PDF
  viewer** (browser-native `<embed>` first; `pdf.js` if we need controls). This
  keeps the default open lightweight (image-only) and never pulls a potentially
  large PDF unless the user is actually going to read it. For images/video, reuse
  the existing rendition images / poster.
- **Text/markdown:** also offer the extracted Markdown via convert_search_ai
  `GET /documents/{uid}/text` (READ-gated) rendered with a markdown component.

## 5. Workstream C — Versioning & metadata

- **`services/versionService.ts`:** `listVersions`, `getVersion(ts)`, `restore`,
  `purge` (`/v1/files/{uid}/versions[...]`).
- **`services/metadataService.ts`:** get-all / get / set / delete
  (`/v1/nodes/{uid}/metadata[/{key}]`).
- UI: "Versions" and "Metadata" tabs in `FileDetailsDrawer.vue` (timeline of
  versions with restore/download; editable key/value metadata grid).

## 6. Workstream D — Role management (admin)

- **`services/roleService.ts`:** `listRoles`, `createRole`, `deleteRole`,
  `usersInRole`, `assign/removeUser`, `rolesForUser`.
- **`views/AdminRolesView.vue`** (route `/admin/roles`, guarded by `system_admin`):
  role list + membership editor (reusing `PrincipalPicker` for user lookup).

## 7. Workstream E — Search (semantic + full-text)

- **`services/searchService.ts`:** `POST {csai}/search { query, limit, fuzzy }`
  → `{ hits: [{ file_uid, name, score, snippet, … }] }` (permission-gated
  server-side). Uses the **CSAI token**.
- **`views/SearchView.vue`** (route `/search`) + a global search box in the shell:
  results link into the file browser (navigate to `file_uid`) and offer "open
  preview" (Workstream B). Show FTS vs. vector provenance if exposed.

## 8. Workstream F — RAG chat with citations

- **`services/chatService.ts`:** opens the `/chat` **WebSocket** (`?token=`),
  sends `{ message, system_prompt?, history?, k? }`, and streams typed events:
  `token` (append), `citations` (render source chips), `done`. Buffers history
  client-side.
- **`components/ChatPanel.vue` / `views/ChatView.vue`** (route `/chat`):
  streaming answer, **citation chips** that deep-link to the cited file's
  preview/text, model-agnostic (works with the Ollama/Claude backends). Handle
  reasoning-model output (e.g. strip/segregate `<think>…</think>`).
- **Pinia:** `stores/chat.ts` (conversation state, streaming buffer).

## 9. Workstream G — Admin / ops (optional, lightweight)

- Storage usage + trigger sync (`GET /v1/storage`, `POST /v1/sync`) on an
  `AdminView`.
- Optional ops widget reading the bridges' `/healthz` `/readyz` `/poolz`
  (monitoring port) for an at-a-glance pool-saturation indicator. Likely behind
  `system_admin` and off by default.

---

## 10. Routing, shell & state summary

- **New routes:** `/search`, `/chat`, `/admin/roles`, `/admin` (guards:
  `requiresAuth`; admin routes additionally `requiresRole: system_admin`).
  Extend `router.beforeEach` with a role check from the auth store.
- **Shell (`App.vue`):** add a nav with File browser · Search · Chat · (Admin),
  a global search box, and the existing tenant selector.
- **New Pinia stores:** `acl`, `chat`; extend `auth` for the CSAI token and a
  `hasAiAccess` getter; `search` (results/last query).
- **New components:** `PrincipalPicker`, `AclEditor`, `PreviewModal`,
  `ChatPanel`, plus tabs added to `FileDetailsDrawer`.

## 11. Testing

- **Unit (Vitest):** services mocked with MSW/axios-mock — assert request
  shapes (`/v1/principals` query params, ACL grant body principal encoding,
  rendition name parsing, chat WS event handling). Mirror existing
  `src/tests/services/*` patterns.
- **Component:** `PrincipalPicker` debounce + category rendering; `AclEditor`
  DENY precedence display; `ChatPanel` streaming/citation rendering;
  `PreviewModal` rendition selection + blob lifecycle.
- **E2E (manual/CI, gated):** against the live stack (bridge + core + LDAP +
  convert_search_ai + Ollama) — login → upload a docx → see thumbnail → open
  inline PDF → edit an ACL with a claim type-ahead → search → RAG chat with a
  citation. Reuse the dev services already wired for the backend e2e suites.

## 12. Phasing

1. **Foundations** (§2): CSAI client, dual-token auth, shared types/helpers.
2. **Previews** (B) + **ACL editor** (A) — highest user value; A is the headline.
3. **Versioning/metadata** (C) + **Role management** (D).
4. **Search** (E) + **RAG chat** (F).
5. **Admin/ops** (G) + polish (empty/error/loading states, a11y, blob cleanup).

Each phase is independently shippable behind the existing auth/tenant model.

## 13. Risks & open questions

- ~~Two token authorities (§2.2)~~ — **resolved.** convert_search_ai trusts the
  bridge token via `/v1/auth/introspect` (`CSAI_BRIDGE_URL`); one login covers
  both services, OAuth included. Frontend uses a single token.
- **Rendition fetch cost** — thumbnails are separate content GETs; need lazy/
  windowed loading and blob-URL cleanup to avoid N+1 and leaks. Consider a future
  bridge convenience endpoint to stream a named rendition directly.
- **Reasoning-model chat output** — `<think>` traces must be handled in the UI.
- **CORS** — both services must allow the SPA origin (`HTTP_CORS_ORIGIN` on the
  bridge; the equivalent on convert_search_ai). Verify for `/chat` WS too.
- **Permission UX** — prefer server-side checks (the bridge/CSAI already gate);
  the UI hides affordances but never relies on client-side checks for security.

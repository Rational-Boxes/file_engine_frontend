# FileEngine Web Client

> ⚠️ **Active development — not production-ready.** This project is under active development and should **not** be considered safe for mission-critical use.

A Vue 3 + TypeScript single-page app for browsing and managing files in
FileEngine, with search and RAG chat, threaded discussion, and tenant
administration over your documents. It is a **pure front-end client** of four
FileEngine backends:

- **`http_bridge`** (`/api`) — filesystem operations, ACLs, and authentication.
- **`csai`** (`/csai`) — full-text/semantic search and RAG chat.
- **`ldap_manager`** (`/ldapadmin`) — tenant user/role administration, email
  invite/reset flows, and self-service profile/password management.
- **`discussion`** (`/discuss`) — document-anchored threads, review requests, an
  attention dashboard, and live comment sync.

The browser holds a single opaque bearer token, minted by the bridge and accepted
by all four services.

## Architecture

```
                          ┌─ /api       ─▶ http_bridge ──gRPC──▶ FileEngine core (files, auth, ACLs)
                          │                                       (source of truth)
Browser (this SPA) ───────┼─ /csai      ─▶ csai ───────────────▶ search index + RAG chat (Ollama/LLM)
  Vue 3 · Pinia · axios   │                                       · WebSocket: chat streaming
  Bearer token (opaque)   ├─ /ldapadmin ─▶ ldap_manager ──LDAP──▶ tenant users, roles, invites & resets
                          └─ /discuss    ─▶ discussion ──gRPC───▶ threads, reviews, comments
                                                                  · WebSocket: live panel + presence
```

- **Pure client.** No backend of its own. Calls are routed by same-origin path:
  filesystem/auth → the bridge (`VITE_API_BASE`); search/chat → CSAI
  (`VITE_CSAI_BASE`); user/role admin and account flows → LDAP Manager
  (`VITE_LDAPADMIN_BASE`); discussion → the discussion service
  (`VITE_DISCUSS_BASE`). Two features stream over WebSockets: chat to
  `/csai/chat`, and a file's live discussion panel to `/discuss/files/{uid}/live`.
- **One token, four services.** The bridge is the token authority. CSAI, LDAP
  Manager and the discussion service accept the **same** opaque bearer token the
  SPA already holds — each validates it against the bridge's
  `/v1/auth/introspect`. There is no second login. A 401 from one of the three
  secondary services degrades that surface locally; it does **not** bounce the
  app to `/login` (only a bridge 401 does).
- **UID-native.** The bridge addresses everything by node UID (no server-side
  paths). The file browser tracks the current directory UID and an in-memory
  breadcrumb trail. The root directory is the all-zeros UUID.
- **Multi-tenant.** The active tenant is taken from the leading subdomain label of
  the host the SPA is served on (e.g. `acme.example.com` or `acme.ngrok.io` →
  tenant `acme`), regardless of the rest of the domain — mirroring the bridge's
  own hostname parsing. A bare host with no subdomain (`localhost`, an IP, a
  single-label host) falls back to the in-app tenant selector. Switching tenant
  hard-resets all in-memory state. The tenant rides on every request as the
  `X-Tenant` header.
- **Auth = opaque bearer token.** Obtained two ways, both from the bridge:
  - **OAuth2 / OIDC** — the SPA redirects to the bridge, which runs a server-side
    flow with the identity provider and redirects back to `/oauth/callback` with
    the token in the URL fragment.
  - **LDAP** — username/password sent to `POST /v1/auth/token` (HTTP Basic).
  Tokens are opaque and have a fixed TTL; there is **no refresh** — on expiry
  (HTTP 401) the app clears the token and returns to the login page.

## Features

- **Login** via OAuth provider buttons **and** an LDAP username/password form.
- **Dashboard:** the landing page — an attention feed (mentions, replies, review
  requests, resolutions) plus recent activity, backed by the discussion service.
- **File browser:** navigate directories with breadcrumbs, create folders, upload
  files (with progress), download, rename, and delete.
- **Previews & thumbnails:** inline document and PDF preview backed by
  server-side renditions; thumbnails in the browser.
- **Versioning:** view and restore prior versions of a file.
- **Details & metadata:** per-file details drawer.
- **Access control:** ACL editor with a principal picker (users/roles).
- **Search:** full-text/semantic search across documents (via CSAI).
- **Chat:** RAG chat over your files with streaming answers, optional web search,
  citations, and a conversation history pane (resume/delete).
- **Discussion (via the discussion service):** document-anchored comment threads
  with constrained-Markdown bodies and `@mentions`; resolve/reopen threads; edit
  (revision-versioned) and soft-delete your own comments; **review requests**
  (raise → acknowledge → complete); admin comment **redaction**. A file's thread
  panel syncs **live** over a WebSocket (new/edited/deleted comments, resolutions,
  and a co-viewer presence roster), falling back to polling when the socket is
  unavailable.
- **Tenant administration (via LDAP Manager, `/admin/tenant`, admins only):**
  a full **user roster** for the workspace — everyone with access, the roles they
  hold, and a filter across name/email/role — with each person opening in a
  **profile modal** that edits their group membership as a whole set and can
  **remove them from this workspace** — dropping their roles here and revoking
  their tenant-bound WebDAV/MCP keys, while other workspaces they belong to are
  untouched. Deleting the global account is a sysadmin/LDAP operation and is
  deliberately not offered here. Alongside it:
  invite a new user, add an existing directory user, manage **roles** (create,
  delete, membership), and customize the **email templates** used for invites and
  password resets (edit, preview, send a test, revert to default).
- **System operations (`/admin/ops`, admins only):** storage usage and sync,
  backed by the bridge.
- **Account self-service (via LDAP Manager):** edit your **profile** and **change
  password** (`/profile`); accept an emailed **invitation** by setting a first
  password (`/set-password`); request and confirm a **password reset**
  (`/reset-password`). The password policy is fetched from the service and
  enforced in-form.

## Project structure

```
frontend/
├── index.html                     # Vite entry point
├── src/
│   ├── main.ts                     # app bootstrap (Pinia + Router)
│   ├── App.vue                     # shell; hydrates auth on mount
│   ├── services/
│   │   ├── apiClient.ts            # bridge axios instance: Bearer + 401 interceptors
│   │   ├── csaiClient.ts           # CSAI axios instance + chat WebSocket URL
│   │   ├── ldapAdminClient.ts      # LDAP Manager axios instance (shared bearer token)
│   │   ├── discussionClient.ts     # discussion axios instance + live WebSocket URL
│   │   ├── discussionLive.ts       # live thread-panel WebSocket session
│   │   ├── authService.ts          # OAuth redirect/callback, LDAP login, whoami
│   │   ├── fileService.ts          # REST filesystem calls (UID-native)
│   │   ├── uploadService.ts        # touch + PUT content (with progress)
│   │   ├── renditions.ts           # preview/thumbnail rendition URLs
│   │   ├── aclService.ts           # ACL read/grant/revoke
│   │   ├── adminService.ts         # storage usage / sync ops (bridge)
│   │   ├── ldapAdminService.ts     # users, roles, email templates, profile, invite/reset
│   │   ├── searchService.ts        # CSAI search
│   │   ├── chatService.ts          # CSAI chat (WebSocket streaming)
│   │   ├── conversationService.ts  # CSAI conversation history
│   │   └── discussionService.ts    # threads, comments, reviews, attention, activity
│   ├── stores/                     # Pinia: auth, files, upload, preview, discussion
│   ├── views/                      # Login, OAuthCallback, Dashboard, FileBrowser,
│   │                               #   Search, Chat, Preview, AdminOps, TenantAdmin,
│   │                               #   Profile, SetPassword, ResetPassword
│   ├── components/                 # AclEditor, FileVersions, FileDetailsDrawer,
│   │                               #   DocumentPreview, PdfPreviewOverlay, FileThumbnail,
│   │                               #   ThreadPanel, ThreadOverlay, CommentNode,
│   │                               #   CommentEditor, ReviewsInbox, TenantSelector,
│   │                               #   AppNav, …
│   ├── composables/useFileNames.ts
│   ├── router/                     # routes (see below)
│   ├── utils/                      # tokenStorage, tenantHost, markdown, permissions, …
│   ├── types/index.ts             # shared TypeScript types
│   └── tests/                      # vitest unit tests
├── e2e/file-ops.mjs               # end-to-end file-ops script (npm run e2e)
├── vite.config.ts                  # dev server on :3000 (+ /api, /csai, /ldapadmin, /discuss proxies), vitest config
└── .env                            # VITE_API_BASE, VITE_CSAI_BASE, VITE_LDAPADMIN_BASE, VITE_DISCUSS_BASE, …
```

### Routes

`/login`, `/oauth/callback`, `/dashboard`, `/files`, `/search`, `/chat`,
`/preview/:uid`, `/admin/ops`, `/admin/tenant`, `/profile`, and the unauthenticated
account flows `/set-password` (invite acceptance) and `/reset-password`
(`/` redirects to `/dashboard`).

## Prerequisites

- **Node.js** 18+ and npm.
- A running **`http_bridge`** instance (which in turn needs the FileEngine gRPC
  core and an LDAP directory). See `../http_bridge/README.md`.
- A running **`csai`** service for search and chat. See
  `../convert_search_ai/README.md`.
- A running **`ldap_manager`** service for tenant administration and the account
  flows (profile/password, invite acceptance, password reset). See
  `../ldap_manager/README.md`.
- A running **`discussion`** service for the dashboard and file discussion. See
  `../discussion_threaded_communication/README.md`.

Only the bridge is strictly required to browse files. CSAI, LDAP Manager and the
discussion service each power their own surfaces, which degrade (or are hidden)
when the service is not configured or reachable.

## Configuration

Create `.env` in the project root. The defaults use **same-origin paths**
(`/api`, `/csai`, `/ldapadmin`, `/discuss`) served by the Vite dev proxy (see
`vite.config.ts`), which mirrors the production nginx routing — so there is no
CORS and no HTTPS→HTTP mixed content through a tunnel:

```bash
# Same-origin paths via the Vite dev proxy
VITE_API_BASE=/api             # -> http_bridge   :8090
VITE_CSAI_BASE=/csai           # -> csai          :8092  (+ chat WebSocket)
VITE_LDAPADMIN_BASE=/ldapadmin # -> ldap_manager  :8093
VITE_DISCUSS_BASE=/discuss     # -> discussion    :8094  (+ live WebSocket)
# OAuth providers to show as login buttons (must be enabled on the bridge)
VITE_OAUTH_PROVIDERS=google,github
# Live-panel poll fallback when the discussion WebSocket is unavailable (ms)
VITE_DISCUSS_POLL_MS=30000
```

Tenancy needs no configuration: it is derived from the host's leading subdomain
label (see above), falling back to the in-app selector on a bare host such as
`localhost`.

| Variable | Meaning |
|---|---|
| `VITE_API_BASE` | Base URL/path of the `http_bridge`. `/api` uses the dev proxy; or an absolute URL for cross-origin. |
| `VITE_CSAI_BASE` | Base URL/path of the `csai` service. `/csai` uses the dev proxy; or an absolute URL. |
| `VITE_LDAPADMIN_BASE` | Base URL/path of the `ldap_manager` service. `/ldapadmin` uses the dev proxy; or an absolute URL. |
| `VITE_DISCUSS_BASE` | Base URL/path of the `discussion` service. `/discuss` uses the dev proxy; or an absolute URL. |
| `VITE_OAUTH_PROVIDERS` | CSV of provider names to render as login buttons. Each must be configured on the bridge (`OAUTH_PROVIDERS`). |
| `VITE_DISCUSS_POLL_MS` | Fallback polling interval (ms) for the live discussion panel when the WebSocket cannot connect. Defaults to `30000`. |

### Cross-origin deployments

The dev proxy (and production same-origin nginx routing) avoids CORS. If you
instead point the `VITE_*_BASE` variables at absolute, cross-origin URLs, each
backend must allow this app's origin (and the bridge must allow its OAuth return
URL):

```bash
# in http_bridge/.env
HTTP_CORS_ORIGIN=http://localhost:3000
OAUTH_RETURN_ALLOWLIST=http://localhost:3000/
```

CSAI, LDAP Manager and the discussion service have their own CORS-origin settings
(see each service's README/`.env`). Provider registration (client IDs/secrets,
redirect URIs) is documented in `../http_bridge/OAUTH_SETUP.md`.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
```

With the default same-origin config, the dev server proxies `/api` →
`:8090` (bridge), `/csai` → `:8092` (CSAI, incl. the chat WebSocket),
`/ldapadmin` → `:8093` (LDAP Manager), and `/discuss` → `:8094` (discussion,
incl. the live-panel WebSocket). Log in with an LDAP account or an OAuth
provider, then land on the dashboard.

## Scripts

```bash
npm run dev          # Vite dev server (:3000, with /api, /csai, /ldapadmin, /discuss proxies)
npm run build        # production build -> dist/
npm run preview      # preview the production build
npm run test         # vitest (watch)
npm run test:ui      # vitest UI
npm run test:run     # vitest (once)
npm run test:coverage
npm run e2e          # end-to-end file-ops script (e2e/file-ops.mjs)
npm run type-check   # vue-tsc --noEmit
npm run lint         # eslint --fix
```

## Testing

Unit tests (vitest, jsdom) cover the services, Pinia stores, utils, components,
and views with axios mocked. Run `npm run test:run`. `e2e/file-ops.mjs`
(`npm run e2e`) exercises file operations against a running stack.

## Build & deploy

`npm run build` emits a static bundle to `dist/`. Serve it from any static host
or reverse proxy. Because this is an SPA using HTML5 history routing, configure a
**catch-all fallback to `index.html`** (e.g. nginx `try_files $uri /index.html`)
so deep links like `/files` resolve. Point the `VITE_*_BASE` variables at the
bridge, CSAI, LDAP Manager, and discussion URLs for the target environment. The
recommended deployment routes all four same-origin (e.g. nginx `/api`, `/csai`,
`/ldapadmin`, and `/discuss` locations, with WebSocket upgrade on `/csai` and
`/discuss`) to avoid CORS; if you serve them cross-origin instead, ensure each
service has the matching CORS origin (and the bridge its `OAUTH_RETURN_ALLOWLIST`).
The `docker_unified` stack wires all of this up for you.

## Related

- **`../http_bridge/`** — the REST proxy for filesystem/auth this app talks to
  (`openapi.yaml` is the API contract; `OAUTH_SETUP.md` covers provider config).
- **`../convert_search_ai/`** — the CSAI service powering search and RAG chat.
- **`../ldap_manager/`** — tenant user/role administration, invite/reset, and
  self-service profile/password (`SPECIFICATION.md` is the design).
- **`../discussion_threaded_communication/`** — document-anchored threads, review
  requests, and live comment sync (`SPECIFICATION.md` is the design).
- **`../docker_unified/`** — single-stack deployment that runs the SPA, bridge,
  CSAI, LDAP Manager, discussion, and dependencies together behind nginx.

## License

Copyright (C) 2026 James Hickman <james@rationalboxes.com>

This project is licensed under the **GNU Affero General Public License, version 3 (or
later)** — see the [LICENSE](LICENSE) file for the full text.

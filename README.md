# FileEngine Web Client

> ⚠️ **Active development — not production-ready.** This project is under active development and should **not** be considered safe for mission-critical use.

A Vue 3 + TypeScript single-page app for browsing and managing files in
FileEngine, with search and RAG chat over your documents. It is a **pure
front-end client** of two FileEngine backends — the HTTP bridge (`http_bridge`)
for filesystem operations and authentication, and the Convert/Search/AI service
(`csai`) for search and chat. The browser holds only an opaque bearer token,
which is sent to both.

## Architecture

```
                          ┌─ /api  ─▶ http_bridge ──gRPC──▶ FileEngine core (files, auth, ACLs)
Browser (this SPA) ───────┤                                 (source of truth)
  Vue 3 · Pinia · axios    └─ /csai ─▶ csai ──────────────▶ search index + RAG chat (Ollama/LLM)
  Bearer token (opaque)
```

- **Pure client.** No backend of its own. Filesystem/auth calls go to the bridge
  (`VITE_API_BASE`); search and chat go to CSAI (`VITE_CSAI_BASE`). No gRPC, no
  Express server in this app — chat streams over a WebSocket to `/csai/chat`.
- **UID-native.** The bridge addresses everything by node UID (no server-side
  paths). The file browser tracks the current directory UID and an in-memory
  breadcrumb trail. The root directory is the all-zeros UUID.
- **Multi-tenant.** Picks the tenant from the host subdomain when
  `VITE_BASE_DOMAIN` is set (e.g. `acme.example.com` → tenant `acme`), otherwise
  shows an in-app tenant selector. Switching tenant hard-resets all in-memory
  state.
- **Auth = opaque bearer token.** Obtained two ways, both from the bridge:
  - **OAuth2 / OIDC** — the SPA redirects to the bridge, which runs a server-side
    flow with the identity provider and redirects back to `/oauth/callback` with
    the token in the URL fragment.
  - **LDAP** — username/password sent to `POST /v1/auth/token` (HTTP Basic).
  Tokens are opaque and have a fixed TTL; there is **no refresh** — on expiry
  (HTTP 401) the app clears the token and returns to the login page.

## Features

- **Login** via OAuth provider buttons **and** an LDAP username/password form.
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
- **Admin:** role management (`/admin/roles`) and operations — storage usage and
  sync (`/admin/ops`).

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
│   │   ├── authService.ts          # OAuth redirect/callback, LDAP login, whoami
│   │   ├── fileService.ts          # REST filesystem calls (UID-native)
│   │   ├── uploadService.ts        # touch + PUT content (with progress)
│   │   ├── renditions.ts           # preview/thumbnail rendition URLs
│   │   ├── aclService.ts           # ACL read/grant/revoke
│   │   ├── roleService.ts          # role management
│   │   ├── adminService.ts         # storage usage / sync ops
│   │   ├── searchService.ts        # CSAI search
│   │   ├── chatService.ts          # CSAI chat (WebSocket streaming)
│   │   └── conversationService.ts  # CSAI conversation history
│   ├── stores/                     # Pinia: auth, files, upload, preview
│   ├── views/                      # Login, OAuthCallback, FileBrowser, Search,
│   │                               #   Chat, Preview, AdminRoles, AdminOps
│   ├── components/                 # AclEditor, FileVersions, FileDetailsDrawer,
│   │                               #   DocumentPreview, PdfPreviewOverlay,
│   │                               #   FileThumbnail, TenantSelector, AppNav, …
│   ├── composables/useFileNames.ts
│   ├── router/                     # routes (see below)
│   ├── utils/                      # tokenStorage, tenantHost, markdown, permissions, …
│   ├── types/index.ts             # shared TypeScript types
│   └── tests/                      # vitest unit tests
├── e2e/file-ops.mjs               # end-to-end file-ops script (npm run e2e)
├── vite.config.ts                  # dev server on :3000 (+ /api & /csai proxy), vitest config
└── .env                            # VITE_API_BASE, VITE_CSAI_BASE, VITE_OAUTH_PROVIDERS, VITE_BASE_DOMAIN
```

### Routes

`/login`, `/oauth/callback`, `/files`, `/search`, `/chat`, `/preview/:uid`,
`/admin/roles`, `/admin/ops` (`/` redirects to `/files`).

## Prerequisites

- **Node.js** 18+ and npm.
- A running **`http_bridge`** instance (which in turn needs the FileEngine gRPC
  core and an LDAP directory). See `../http_bridge/README.md`.
- A running **`csai`** service for search and chat. See
  `../convert_search_ai/README.md`.

## Configuration

Create `.env` in the project root. The defaults use **same-origin paths**
(`/api`, `/csai`) served by the Vite dev proxy (see `vite.config.ts`), which
mirrors the production nginx routing — so there is no CORS and no
HTTPS→HTTP mixed content through a tunnel:

```bash
# Same-origin paths via the Vite dev proxy (-> http_bridge :8090 / csai :8092)
VITE_API_BASE=/api
VITE_CSAI_BASE=/csai
# OAuth providers to show as login buttons (must be enabled on the bridge)
VITE_OAUTH_PROVIDERS=google,github
# Apex domain for subdomain tenancy. Empty -> in-app tenant selector.
VITE_BASE_DOMAIN=
```

| Variable | Meaning |
|---|---|
| `VITE_API_BASE` | Base URL/path of the `http_bridge`. `/api` uses the dev proxy; or an absolute URL for cross-origin. |
| `VITE_CSAI_BASE` | Base URL/path of the `csai` service. `/csai` uses the dev proxy; or an absolute URL. |
| `VITE_OAUTH_PROVIDERS` | CSV of provider names to render as login buttons. Each must be configured on the bridge (`OAUTH_PROVIDERS`). |
| `VITE_BASE_DOMAIN` | Apex domain for subdomain-based tenant selection. Empty shows the in-app selector. |

### Cross-origin deployments

The dev proxy (and production same-origin nginx routing) avoids CORS. If you
instead point `VITE_API_BASE`/`VITE_CSAI_BASE` at absolute, cross-origin URLs,
the bridge must allow this app's origin and OAuth return URL:

```bash
# in http_bridge/.env
HTTP_CORS_ORIGIN=http://localhost:3000
OAUTH_RETURN_ALLOWLIST=http://localhost:3000/
```

Provider registration (client IDs/secrets, redirect URIs) is documented in
`../http_bridge/OAUTH_SETUP.md`.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
```

With the default same-origin config, the dev server proxies `/api` →
`http://localhost:8090` (bridge) and `/csai` → `http://localhost:8092` (csai,
incl. the chat WebSocket). Log in with an LDAP account or an OAuth provider,
then browse the root directory.

## Scripts

```bash
npm run dev          # Vite dev server (:3000, with /api & /csai proxy)
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
so deep links like `/files` resolve. Point `VITE_API_BASE` and `VITE_CSAI_BASE`
at the bridge and CSAI URLs for the target environment. The recommended
deployment routes both same-origin (e.g. nginx `/api` and `/csai` locations) to
avoid CORS; if you serve them cross-origin instead, ensure the bridge has the
matching `HTTP_CORS_ORIGIN` and `OAUTH_RETURN_ALLOWLIST`. The `docker_unified`
stack wires all of this up for you.

## Related

- **`../http_bridge/`** — the REST proxy for filesystem/auth this app talks to
  (`openapi.yaml` is the API contract; `OAUTH_SETUP.md` covers provider config).
- **`../convert_search_ai/`** — the CSAI service powering search and RAG chat.
- **`../docker_unified/`** — single-stack deployment that runs the SPA, bridge,
  CSAI, and dependencies together behind nginx.

## License

Copyright (C) 2026 James Hickman <james@rationalboxes.com>

This project is licensed under the **GNU Affero General Public License, version 3 (or
later)** — see the [LICENSE](LICENSE) file for the full text.

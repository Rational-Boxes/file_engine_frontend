# FileEngine Web Client

A Vue 3 + TypeScript single-page app for browsing and managing files in
FileEngine. It is a **pure REST client of the FileEngine HTTP bridge**
(`http_bridge`) — all filesystem operations and authentication go through the
bridge's JSON/REST API; the browser holds only an opaque bearer token.

## Architecture

```
Browser (this SPA) ──HTTPS/JSON, Bearer──▶ http_bridge ──gRPC──▶ FileEngine core
   Vue 3 · Pinia · axios                    REST /v1/*            (source of truth)
```

- **Pure client.** No backend of its own. Every call is a REST request to the
  bridge (`VITE_API_BASE`). There is no gRPC, no Express server, no transform
  service in this app.
- **UID-native.** The bridge addresses everything by node UID (no server-side
  paths). The file browser tracks the current directory UID and an in-memory
  breadcrumb trail. The root directory is the all-zeros UUID.
- **Auth = opaque bearer token.** Obtained two ways, both from the bridge:
  - **OAuth2 / OIDC** — the SPA redirects to the bridge, which runs a server-side
    flow with the identity provider and redirects back to `/oauth/callback` with
    the token in the URL fragment.
  - **LDAP** — username/password sent to `POST /v1/auth/token` (HTTP Basic).
  Tokens are opaque and have a fixed TTL; there is **no refresh** — on expiry
  (HTTP 401) the app clears the token and returns to the login page.

## Features (current)

- Login via OAuth provider buttons **and** an LDAP username/password form.
- File browser: navigate directories with breadcrumbs, create folders, upload
  files (with progress), download, rename, and delete.
- Role-aware access level derived from the identity returned by `/v1/whoami`.

> Not yet implemented (follow-on): versioning, metadata, ACL/permissions, role
> management, and admin (storage/sync) UI. These exist in the bridge API but have
> no UI here yet.

## Project structure

```
frontend/
├── index.html                     # Vite entry point
├── src/
│   ├── main.ts                     # app bootstrap (Pinia + Router)
│   ├── App.vue                     # shell; hydrates auth on mount
│   ├── services/
│   │   ├── apiClient.ts            # axios instance, Bearer + 401 interceptors
│   │   ├── authService.ts          # OAuth redirect/callback, LDAP login, whoami
│   │   ├── fileService.ts          # REST filesystem calls (UID-native)
│   │   └── uploadService.ts        # touch + PUT content (with progress)
│   ├── stores/                     # Pinia: auth, files, upload
│   ├── views/                      # LoginView, OAuthCallbackView, FileBrowserView
│   ├── router/                     # /login, /oauth/callback, /files
│   ├── utils/tokenStorage.ts       # token persistence (localStorage + memory)
│   └── tests/                      # vitest unit tests
├── vite.config.ts                  # dev server on :3000, vitest config
└── .env                            # VITE_API_BASE, VITE_OAUTH_PROVIDERS
```

## Prerequisites

- **Node.js** 18+ and npm.
- A running **`http_bridge`** instance (which in turn needs the FileEngine gRPC
  core and an LDAP directory). See `../http_bridge/README.md`.

## Configuration

Create `.env` in the project root:

```bash
# Base URL of the http_bridge REST proxy
VITE_API_BASE=http://localhost:8090
# OAuth providers to show as login buttons (must be enabled on the bridge)
VITE_OAUTH_PROVIDERS=google,github
```

| Variable | Meaning |
|---|---|
| `VITE_API_BASE` | Base URL of the `http_bridge` (no trailing slash). |
| `VITE_OAUTH_PROVIDERS` | CSV of provider names to render as login buttons. Each must be configured on the bridge (`OAUTH_PROVIDERS`). |

### Bridge-side requirements

Because the browser calls the bridge cross-origin and OAuth redirects back to
this app, the bridge must allow this origin:

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

Log in with an LDAP account or an OAuth provider, then browse the root
directory.

## Scripts

```bash
npm run dev          # Vite dev server (:3000)
npm run build        # production build -> dist/
npm run preview      # preview the production build
npm run test         # vitest (watch)
npm run test:run     # vitest (once)
npm run test:coverage
npm run type-check   # vue-tsc --noEmit
npm run lint
```

## Testing

Unit tests (vitest, jsdom) cover the REST services and Pinia stores with axios
mocked. Run `npm run test:run`.

## Build & deploy

`npm run build` emits a static bundle to `dist/`. Serve it from any static host
or reverse proxy. Because this is an SPA using HTML5 history routing, configure a
**catch-all fallback to `index.html`** (e.g. nginx `try_files $uri /index.html`)
so deep links like `/files` resolve. Point `VITE_API_BASE` at the bridge URL for
the target environment, and make sure that environment's bridge has the matching
`HTTP_CORS_ORIGIN` and `OAUTH_RETURN_ALLOWLIST`.

## Related

- **`../http_bridge/`** — the REST proxy this app talks to (`openapi.yaml` is the
  API contract; `OAUTH_SETUP.md` covers provider configuration).

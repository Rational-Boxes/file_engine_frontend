/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_OAUTH_PROVIDERS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

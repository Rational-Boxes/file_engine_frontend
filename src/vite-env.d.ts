/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  // Base URL of the convert_search_ai service (search + RAG chat + previews).
  readonly VITE_CSAI_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

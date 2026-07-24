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

import csaiClient, { errorMessage } from '@/services/csaiClient'

// ONLYOFFICE in-browser editing (Phase 1.7). CSAI builds the signed editor config
// server-side (as the authenticated user, WRITE-checked); the SPA hands it to the
// Document Server's `DocsAPI.DocEditor`. Editing is disabled → the config endpoint
// returns 404, which callers surface as "editing unavailable".

// The ONLYOFFICE editor config (opaque to us apart from a few fields we read for
// the page title). We pass it through to DocsAPI verbatim.
export interface OnlyOfficeConfig {
  documentType: string
  document: { fileType: string; key: string; title: string; url: string; [k: string]: unknown }
  editorConfig: { mode: string; callbackUrl: string; user: { id: string; name: string }; [k: string]: unknown }
  token?: string
  [k: string]: unknown
}

export interface EditorBundle {
  config: OnlyOfficeConfig
  docserverUrl: string // public base URL to load the Document Server's api.js from
}

export const onlyofficeService = {
  // Fetch the signed editor config for a file. Throws (via errorMessage) on 403
  // (no WRITE), 404 (disabled), 415 (not an office document).
  async getEditorConfig(fileUid: string): Promise<EditorBundle> {
    const { data } = await csaiClient.get(`/v1/onlyoffice/config/${encodeURIComponent(fileUid)}`)
    return { config: data.config, docserverUrl: data.docserver_url }
  },
}

export { errorMessage }

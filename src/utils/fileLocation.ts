import type { RouteLocationRaw } from 'vue-router'

// Shared builder for a file-browser deep link — the single source of truth for the
// `?file=<uid>&tenant=<t>` shape. UIDs are tenant-scoped, so the tenant travels
// with the link. Used by the "Copy link" action AND by the browser's own
// navigation, which mirrors the current folder here so reload/bookmarks restore
// the location. Omit `uid` (at the root) or `tenant` to leave them out of the query.
export function fileBrowserLocation(
  uid?: string | null,
  tenant?: string | null,
): RouteLocationRaw {
  const query: Record<string, string> = {}
  if (uid) query.file = uid
  if (tenant) query.tenant = tenant
  return { name: 'FileBrowser', query }
}

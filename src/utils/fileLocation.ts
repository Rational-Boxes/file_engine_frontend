import type { RouteLocationRaw } from 'vue-router'

// Shared builder for a file-browser deep link — the single source of truth for the
// `?folder=<uid>` / `?file=<uid>` (+ `&tenant=<t>`) shape. The query key names the
// entity kind: a directory is `folder`, a file is `file` (both resolve to the same
// reveal — folders open, files open-parent-and-select). UIDs are tenant-scoped, so
// the tenant travels with the link. Used by the "Copy link" action AND by the
// browser's own navigation, which mirrors the current folder here so reload/
// bookmarks restore the location. Omit `uid` (at the root) or `tenant` to drop them.
export function fileBrowserLocation(
  uid?: string | null,
  tenant?: string | null,
  kind: 'file' | 'folder' = 'folder',
): RouteLocationRaw {
  const query: Record<string, string> = {}
  if (uid) query[kind] = uid
  if (tenant) query.tenant = tenant
  return { name: 'FileBrowser', query }
}

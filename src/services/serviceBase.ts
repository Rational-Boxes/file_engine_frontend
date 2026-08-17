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

// Base URL resolution for the satellite service clients (bridge, CSAI, discussion,
// folder_actions, ldap-manager, audit, BCF).
//
// Every one of these services is reachable at a SAME-ORIGIN PATH in both modes:
//   - dev:  the Vite proxy in vite.config.ts forwards the path to localhost:<port>
//   - prod: nginx routes the path to the service (docker_unified
//           images/nginx/snippets/tenant.conf)
//
// So the path — not an absolute `http://localhost:<port>` — is the correct default
// everywhere, and these three lists must stay in step: the DEFAULTS below, the dev
// proxy table, and the nginx tenant snippet.
//
// This used to default to absolute localhost URLs, which failed in a way nothing
// caught: a production build with the env var unset produced a bundle pointing at
// the developer's own machine. It built clean and only broke in the user's browser.
// A path default cannot fail that way — worst case it 404s on the same origin.
//
// An explicit VITE_*_BASE still wins, so pointing a client at a service on another
// host (a shared staging backend, a tunnel) stays a one-line env change.
export const SERVICE_PATHS = {
  api: '/api',
  csai: '/csai',
  discuss: '/discuss',
  folderActions: '/folder-actions',
  ldapAdmin: '/ldapadmin',
  audit: '/audit',
  bcf: '/bcf',
} as const

/**
 * Resolve a service's base URL: an explicit env override, else the same-origin path.
 *
 * @param override the raw `import.meta.env.VITE_*_BASE` value (may be undefined)
 * @param path     the service's same-origin path, from SERVICE_PATHS
 */
export function serviceBase(override: string | undefined, path: string): string {
  const trimmed = (override ?? '').trim()
  return trimmed || path
}

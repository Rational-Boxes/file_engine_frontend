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

import { describe, it, expect } from 'vitest'

import { SERVICE_PATHS, serviceBase } from '@/services/serviceBase'

describe('serviceBase', () => {
  it('falls back to the same-origin path when the env var is unset', () => {
    // The regression this guards: an unset var used to yield http://localhost:<port>,
    // which builds clean and then points a user's browser at their own machine.
    expect(serviceBase(undefined, SERVICE_PATHS.discuss)).toBe('/discuss')
  })

  it('treats an empty or whitespace-only override as unset', () => {
    expect(serviceBase('', SERVICE_PATHS.api)).toBe('/api')
    expect(serviceBase('   ', SERVICE_PATHS.api)).toBe('/api')
  })

  it('honours an explicit absolute override', () => {
    expect(serviceBase('https://staging.example.com', SERVICE_PATHS.csai))
      .toBe('https://staging.example.com')
  })

  it('honours an explicit path override', () => {
    expect(serviceBase('/other', SERVICE_PATHS.csai)).toBe('/other')
  })

  it('trims a padded override', () => {
    expect(serviceBase('  /other  ', SERVICE_PATHS.csai)).toBe('/other')
  })

  it('never defaults any service to an absolute URL', () => {
    for (const path of Object.values(SERVICE_PATHS)) {
      expect(path.startsWith('/')).toBe(true)
    }
  })
})

describe('service clients resolve to same-origin paths by default', () => {
  // The env vars are unset under vitest, so each client exercises its fallback —
  // exactly the production-build case that used to break.
  it('uses the declared path for every client', async () => {
    const [api, csai, discuss, folderActions, ldapAdmin, audit] = await Promise.all([
      import('@/services/apiClient'),
      import('@/services/csaiClient'),
      import('@/services/discussionClient'),
      import('@/services/folderActionsClient'),
      import('@/services/ldapAdminClient'),
      import('@/services/auditClient'),
    ])
    expect(api.API_BASE).toBe(SERVICE_PATHS.api)
    expect(csai.CSAI_BASE).toBe(SERVICE_PATHS.csai)
    expect(discuss.DISCUSS_BASE).toBe(SERVICE_PATHS.discuss)
    expect(folderActions.FOLDER_ACTIONS_BASE).toBe(SERVICE_PATHS.folderActions)
    expect(ldapAdmin.LDAPADMIN_BASE).toBe(SERVICE_PATHS.ldapAdmin)
    expect(audit.AUDIT_BASE).toBe(SERVICE_PATHS.audit)
  })
})

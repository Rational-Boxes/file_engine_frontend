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

// Read-only status of the deployment's commercial embedding integration (§14.2),
// from the http_bridge admin endpoint GET /v1/integrations. Never returns key material.

import apiClient from '@/services/apiClient'

// One integration's non-secret status (mirrors integrationStatusJson in the bridge).
export interface EmbedIntegrationStatus {
  enabled: boolean
  issuer: string
  audience: string
  key_present: boolean
  allowed_ips: string[]
  ip_allowlist_enforced: boolean
  allow_service: boolean
}

export const embedIntegrationService = {
  // The deployment holds at most one embedding integration; the list is empty when
  // none is configured.
  async list(): Promise<EmbedIntegrationStatus[]> {
    const { data } = await apiClient.get<{ integrations: EmbedIntegrationStatus[] }>('/v1/integrations')
    return data.integrations ?? []
  },
}

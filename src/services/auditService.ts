import auditClient from './auditClient'

// One audit-log row as returned by GET /v1/audit/query (codes decoded to strings).
export interface AuditRow {
  seq: number
  ts: string
  category: string
  action: string
  outcome: string
  actor: string
  actor_roles: string[]
  target_uid: string | null
  target_name: string | null
  target_type: string | null
  detail: Record<string, unknown> | null
  source_iface: string | null
  source_addr: string | null
  request_id: string | null
}

export interface AuditQueryParams {
  tenant: string
  actor?: string
  target_uid?: string
  category?: string
  action?: string
  outcome?: string
  from?: string
  to?: string
  page?: number
  page_size?: number
}

export interface AuditQueryResult {
  rows: AuditRow[]
  page: number
  page_size: number
  count: number
}

export interface ChainResult {
  ok: boolean
  checked: number
  first_broken_seq: number | null
  reason: string | null
}

// Only the set fields are sent, so an empty filter never over-constrains.
function clean(params: AuditQueryParams): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  )
}

export const auditService = {
  async query(params: AuditQueryParams): Promise<AuditQueryResult> {
    return (await auditClient.get('/v1/audit/query', { params: clean(params) })).data
  },

  // Streamed NDJSON compliance dump (returned as a Blob for a browser download).
  async exportNdjson(params: AuditQueryParams): Promise<Blob> {
    return (await auditClient.get('/v1/audit/export', { params: clean(params), responseType: 'blob' })).data
  },

  async verify(tenant: string): Promise<ChainResult> {
    return (await auditClient.get('/v1/audit/verify', { params: { tenant } })).data
  },
}

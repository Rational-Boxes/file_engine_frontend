import auditClient from './auditClient'

// A flagged security incident (rules engine, §11).
export interface Incident {
  id: number
  ts: string
  tenant: string | null
  rule_id: string
  group_by: string
  group_key: string
  actor: string | null
  severity: string
  response: string
  match_count: number
  window_s: number
  action_taken: string
  dry_run: boolean
  description: string | null
  status: string
}

// A security rule (the DSL — mirrors audit_service.rules.Rule).
export interface SecurityRule {
  id: string
  description: string
  category: string
  group_by: string
  window_s: number
  threshold: number
  action?: string | null
  outcome?: string | null
  then_action?: string | null
  severity: string
  response: string
  dry_run: boolean
  cooldown_s: number
  enabled: boolean
}

export interface RulesView {
  effective: SecurityRule[]
  defaults: { rule_id: string; definition: SecurityRule; enabled: boolean; updated_at: string }[]
  overrides: { rule_id: string; definition: SecurityRule; enabled: boolean; updated_at: string }[]
}

export const securityService = {
  async incidents(tenant: string, status?: string): Promise<Incident[]> {
    const params: Record<string, unknown> = { tenant }
    if (status) params.status = status
    return (await auditClient.get('/v1/security/incidents', { params })).data.incidents
  },

  async setIncidentStatus(id: number, status: string, tenant: string): Promise<void> {
    await auditClient.post(`/v1/security/incidents/${id}/status`, { status }, { params: { tenant } })
  },

  async rules(tenant: string): Promise<RulesView> {
    return (await auditClient.get('/v1/security/rules', { params: { tenant } })).data
  },

  async saveRule(rule: SecurityRule, tenant: string): Promise<void> {
    await auditClient.put('/v1/security/rules', rule, { params: { tenant } })
  },

  async deleteRule(ruleId: string, tenant: string): Promise<void> {
    await auditClient.delete(`/v1/security/rules/${encodeURIComponent(ruleId)}`, { params: { tenant } })
  },

  async validate(rule: SecurityRule, tenant: string): Promise<{ would_fire: number; events_examined: number }> {
    return (await auditClient.post('/v1/security/rules/validate', rule, { params: { tenant } })).data
  },
}

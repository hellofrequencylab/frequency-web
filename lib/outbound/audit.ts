// OUTBOUND: the immutable approval trail.
//
// Every approval transition in lib/outbound/approvals.ts writes ONE row here, so
// "who armed what, when" is always answerable. Without it the governing rule
// ("nothing sends without approval") would be enforceable but not auditable, and a
// rule nobody can check after the fact is a rule that erodes.
//
// ⚠️ THE TABLE KEEPS ITS OLD NAME, `beta_audit_log`, deliberately. It holds LIVE
// rows written under that name since the spine shipped, and renaming a table to
// match a moved module would either orphan that history or need a data migration
// whose only benefit is tidier prose. The name is where the trail started, not
// what it is for; this header is the pointer for the next reader. The FUNCTIONS
// below follow the module (logOutboundAction / listOutboundAudit); only the
// `.from('beta_audit_log')` string is pinned to history.
//
// Writes are FAIL-SAFE: a failed audit insert never blocks or reverses the
// transition it records (the transition already succeeded), it is logged and
// swallowed. Server-only.

import { outboundDb } from './db'

export type OutboundAuditAction =
  | 'mark_ready'
  | 'approve'
  | 'schedule'
  | 'pause'
  | 'cancel'
  | 'record_test_send'
  | 'arm_phase'
  // Historical rows only. Their writers are gone (the beta wave + graduation
  // engines, then the Beta Command Center itself). Kept in the union so the trail
  // reader can still label rows that exist in the table today.
  | 'propose_wave'
  | 'admit_wave'
  | 'graduate_beta'

export type OutboundAuditTargetType = 'campaign' | 'phase' | 'platform'

export interface LogOutboundActionInput {
  actorProfileId: string | null
  action: OutboundAuditAction | string
  targetType: OutboundAuditTargetType | string
  targetId: string | null
  detail?: Record<string, unknown>
}

/** Append one row to the outbound approval trail. Fail-safe: never throws. */
export async function logOutboundAction(input: LogOutboundActionInput): Promise<void> {
  try {
    await outboundDb()
      .from('beta_audit_log')
      .insert({
        actor_profile_id: input.actorProfileId,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId,
        detail: input.detail ?? {},
      })
  } catch (err) {
    console.error('[outbound] audit log write failed:', err)
  }
}

export interface OutboundAuditRow {
  id: string
  actorProfileId: string | null
  action: string
  targetType: string
  targetId: string | null
  detail: Record<string, unknown>
  createdAt: string | null
}

export interface ListOutboundAuditOptions {
  targetType?: string
  targetId?: string
  limit?: number
}

/** Read the trail, newest first. Optionally scoped to one target. FAIL-SAFE to []. */
export async function listOutboundAudit(options: ListOutboundAuditOptions = {}): Promise<OutboundAuditRow[]> {
  try {
    let q = outboundDb()
      .from('beta_audit_log')
      .select('id, actor_profile_id, action, target_type, target_id, detail, created_at')
    if (options.targetType) q = q.eq('target_type', options.targetType)
    if (options.targetId) q = q.eq('target_id', options.targetId)
    q = q.order('created_at', { ascending: false }).limit(options.limit ?? 100)
    const { data } = await q
    return (data ?? []).map((r) => ({
      id: String(r.id),
      actorProfileId: (r.actor_profile_id as string) ?? null,
      action: String(r.action),
      targetType: String(r.target_type),
      targetId: (r.target_id as string) ?? null,
      detail: (r.detail && typeof r.detail === 'object' ? r.detail : {}) as Record<string, unknown>,
      createdAt: (r.created_at as string) ?? null,
    }))
  } catch (err) {
    console.error('[outbound] audit log read failed:', err)
    return []
  }
}

// Beta Command Center: the immutable approval trail (beta_audit_log).
//
// Every approval transition in lib/beta/approvals.ts writes ONE row here, so
// "who armed what, when" is always answerable. Writes are FAIL-SAFE: a failed
// audit insert never blocks or reverses the transition it records (the
// transition already succeeded), it is logged and swallowed. Server-only.

import { betaDb } from './db'

export type BetaAuditAction =
  | 'mark_ready'
  | 'approve'
  | 'schedule'
  | 'pause'
  | 'cancel'
  | 'record_test_send'
  | 'arm_phase'
  // Admission waves (lib/beta/admission.ts) + the beta graduation (lib/beta/graduation.ts).
  | 'propose_wave'
  | 'admit_wave'
  | 'graduate_beta'

export type BetaAuditTargetType = 'campaign' | 'admission_wave' | 'phase' | 'platform'

export interface LogBetaActionInput {
  actorProfileId: string | null
  action: BetaAuditAction | string
  targetType: BetaAuditTargetType | string
  targetId: string | null
  detail?: Record<string, unknown>
}

/** Append one row to the beta approval trail. Fail-safe: never throws. */
export async function logBetaAction(input: LogBetaActionInput): Promise<void> {
  try {
    await betaDb()
      .from('beta_audit_log')
      .insert({
        actor_profile_id: input.actorProfileId,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId,
        detail: input.detail ?? {},
      })
  } catch (err) {
    console.error('[beta] audit log write failed:', err)
  }
}

export interface BetaAuditRow {
  id: string
  actorProfileId: string | null
  action: string
  targetType: string
  targetId: string | null
  detail: Record<string, unknown>
  createdAt: string | null
}

export interface ListBetaAuditOptions {
  targetType?: string
  targetId?: string
  limit?: number
}

/** Read the trail, newest first. Optionally scoped to one target. FAIL-SAFE to []. */
export async function listBetaAudit(options: ListBetaAuditOptions = {}): Promise<BetaAuditRow[]> {
  try {
    let q = betaDb()
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
    console.error('[beta] audit log read failed:', err)
    return []
  }
}

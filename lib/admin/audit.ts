// Admin audit log (P8). One append-only stream for sensitive platform actions — who did
// what, to whom. Instrument the gated server actions with logAdminAction(); read with
// getRecentAdminActions() on the audit surface. Best-effort: a failed log NEVER blocks
// the action it records. Server-only. admin_audit_log isn't in the generated types (cast).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface AdminAuditEntry {
  actorId: string | null
  /** Dotted action key, e.g. 'role.assign', 'persona.verified'. */
  action: string
  targetType?: string | null
  targetId?: string | null
  detail?: Record<string, unknown>
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** Record a sensitive admin action. Best-effort — never throws. */
export async function logAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    await db().from('admin_audit_log').insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      detail: entry.detail ?? {},
    })
  } catch {
    /* the audit ledger is best-effort; a failed log must not affect the action */
  }
}

export interface AdminAuditRow {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  detail: Record<string, unknown>
  createdAt: string
  actor: { displayName: string; handle: string | null } | null
}

/** Recent admin actions, newest first — for the audit surface. */
export async function getRecentAdminActions(limit = 100): Promise<AdminAuditRow[]> {
  const { data } = await db()
    .from('admin_audit_log')
    .select('id, action, target_type, target_id, detail, created_at, actor:profiles!actor_id ( display_name, handle )')
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as Array<{
    id: string
    action: string
    target_type: string | null
    target_id: string | null
    detail: Record<string, unknown> | null
    created_at: string
    actor: { display_name: string | null; handle: string | null } | null
  }>).map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    detail: r.detail ?? {},
    createdAt: r.created_at,
    actor: r.actor ? { displayName: r.actor.display_name ?? 'Unknown', handle: r.actor.handle } : null,
  }))
}

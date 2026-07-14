// The FIRE-SAFE writer for the broadcast Dispatch recipient ledger (`dispatch_recipients`, CRM
// Phase 5). A Dispatch fan-out (app/(main)/broadcast/actions.ts) records one row per (dispatch,
// member, channel) with the send-gate outcome, so a Dispatch shows up in the messaging control
// panel next to campaign sends. Writing this log must NEVER break a broadcast: every call is
// wrapped, best-effort, and swallows its own errors (the send has already happened).
//
// The table is not in the generated DB types yet, so the insert goes through the untyped admin
// client (ADR-246, the repo convention for not-yet-typed tables).

import { createAdminClient } from '@/lib/supabase/admin'

/** One row of the dispatch recipient ledger. Mirrors 20261162000000_dispatch_recipients.sql. */
export interface DispatchRecipientRow {
  dispatch_id: string
  profile_id: string | null
  channel: 'email' | 'push'
  status: 'sent' | 'skipped' | 'suppressed' | 'failed'
  reason: string | null
  email: string | null
}

/**
 * Persist a batch of dispatch recipient rows. FIRE-SAFE: any error (a missing table before the
 * migration applies, a transient write failure) is logged and swallowed so the broadcast is never
 * affected. A no-op for an empty batch.
 */
export async function logDispatchRecipients(rows: DispatchRecipientRow[]): Promise<void> {
  if (!rows.length) return
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { insert: (rows: DispatchRecipientRow[]) => Promise<{ error: unknown }> }
    }
    const { error } = await db.from('dispatch_recipients').insert(rows)
    if (error) console.warn('[dispatch-log] recipient log write failed (non-fatal):', error)
  } catch (err) {
    console.warn('[dispatch-log] recipient log write threw (non-fatal):', err)
  }
}

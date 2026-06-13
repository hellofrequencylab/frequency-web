// Server-side trust ledger + projection (ADR-247). Emit a signal (append-only, exactly
// once — mirrors recordEngagementEvent), then recompute the score projection by replaying
// the ledger. Service-role; reads go through the admin client behind app-code authz (the
// member-consented, explainable read RPC is a follow-up).

import { createAdminClient } from '@/lib/supabase/admin'
import { computeScores, type SignalForCompute } from './compute'
import { weightFor } from './weights'

export interface RecordTrustSignalInput {
  profileId: string
  /** Emitting source/vertical, e.g. 'marketplace'. */
  source: string
  /** Signal within the source, e.g. 'deal_completed'. */
  signalType: string
  /** Context to score into; defaults to 'global'. */
  context?: string
  /** Exactly-once across retries (like engagement_events). */
  idempotencyKey?: string
  meta?: Record<string, unknown>
  /** Recompute the projection on first insert (default true). */
  recompute?: boolean
}

export interface RecordTrustSignalResult {
  /** false = duplicate idempotency_key; nothing recorded this time. */
  recorded: boolean
}

/**
 * Append a trust signal exactly once, then (by default) recompute the profile's score.
 * A repeated `idempotencyKey` is a no-op. The stored `weight` is the current catalog
 * snapshot for audit; recompute always re-derives from the live catalog.
 */
export async function recordTrustSignal(input: RecordTrustSignalInput): Promise<RecordTrustSignalResult> {
  const { profileId, source, signalType } = input
  const context = input.context ?? 'global'
  const db = createAdminClient()

  const { data, error } = await db
    .from('trust_signals')
    .upsert(
      {
        profile_id: profileId,
        source,
        signal_type: signalType,
        context,
        weight: weightFor(source, signalType),
        meta: (input.meta ?? {}) as never,
        idempotency_key: input.idempotencyKey ?? null,
      },
      // Only dedupe when an idempotency key is supplied (the column is unique + nullable).
      input.idempotencyKey
        ? { onConflict: 'idempotency_key', ignoreDuplicates: true }
        : { ignoreDuplicates: false },
    )
    .select('id')

  if (error) throw error
  const recorded = (data?.length ?? 0) > 0

  if (recorded && (input.recompute ?? true)) await recomputeTrustScore(profileId)
  return { recorded }
}

/** Replay a profile's signals → overwrite its trust_scores projection. Recomputable. */
export async function recomputeTrustScore(profileId: string): Promise<void> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('trust_signals')
    .select('source, signal_type, context')
    .eq('profile_id', profileId)
  if (error) throw error

  const signals: SignalForCompute[] = (data ?? []).map((r) => ({
    source: r.source,
    signalType: r.signal_type,
    context: r.context,
  }))
  const { rows } = computeScores(signals)

  // Replace the projection: clear, then write the freshly computed rows. (A single profile's
  // handful of context rows — cheap; keeps the projection an exact function of the ledger.)
  await db.from('trust_scores').delete().eq('profile_id', profileId)
  if (rows.length) {
    const now = new Date().toISOString()
    const { error: insErr } = await db.from('trust_scores').insert(
      rows.map((r) => ({
        profile_id: profileId,
        context: r.context,
        score: r.score,
        signal_count: r.signalCount,
        updated_at: now,
      })),
    )
    if (insErr) throw insErr
  }
}

export interface TrustScore {
  global: number
  byContext: Record<string, number>
}

/** Batch-read the GLOBAL trust score for many profiles → Map(profileId → score). For
 *  operator lists (e.g. the verification queue) — one query, missing profiles read 0. */
export async function getGlobalTrustScores(profileIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!profileIds.length) return out
  const { data } = await createAdminClient()
    .from('trust_scores')
    .select('profile_id, score')
    .eq('context', 'global')
    .in('profile_id', profileIds)
  for (const r of (data ?? []) as { profile_id: string; score: number }[]) {
    out.set(r.profile_id, r.score)
  }
  return out
}

/** Read a profile's score projection as { global, byContext }. */
export async function getTrustScore(profileId: string): Promise<TrustScore> {
  const { data } = await createAdminClient()
    .from('trust_scores')
    .select('context, score')
    .eq('profile_id', profileId)
  const rows = (data ?? []) as { context: string; score: number }[]
  const byContext: Record<string, number> = {}
  let global = 0
  for (const r of rows) {
    if (r.context === 'global') global = r.score
    else byContext[r.context] = r.score
  }
  return { global, byContext }
}

// Server-side trust ledger + projection (ADR-247). Emit a signal (append-only, exactly
// once — mirrors recordEngagementEvent), then recompute the score projection by replaying
// the ledger. Service-role; reads go through the admin client behind app-code authz. The member's
// explainable read is readOwnTrustSignals + explainTrust (LIVE-679): the caller passes the SIGNED-IN
// member's own profile id, never one from a request, so a member only ever reads their own.

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
async function recomputeTrustScore(profileId: string): Promise<void> {
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

/** A member's OWN signals, for the explainable read (lib/trust/explain.ts). The caller passes the
 *  signed-in member's profile id; nothing here takes one from a request. FAIL-SAFE to []. */
export async function readOwnTrustSignals(profileId: string): Promise<SignalForCompute[]> {
  if (!profileId) return []
  const { data, error } = await createAdminClient()
    .from('trust_signals')
    .select('source, signal_type, context')
    .eq('profile_id', profileId)
    .limit(5000)
  if (error) {
    console.error('[trust] own signals unreadable', { profileId, error: error.message })
    return []
  }
  return (data ?? []).map((r) => ({ source: r.source, signalType: r.signal_type, context: r.context }))
}

/** How many ledger rows one recompute pass reads at most (the nightly cron's budget). */
const RECOMPUTE_PAGE = 1000

/**
 * THE RECOMPUTE JOB (LIVE-679). Replays the whole ledger with the CURRENT weight catalog and upserts
 * every (profile, context) projection row, so a weight tuned in weights.ts reaches every member by
 * the next night instead of waiting for that member's next signal. Signals are append-only, so a
 * context never disappears and an upsert is the whole write. Bounded by `maxRows`; a ledger past it
 * is reported as `truncated` and the tail is picked up when a member's next signal recomputes them.
 * Never throws: the nightly cron logs what it returns.
 */
export async function recomputeAllTrustScores(
  opts: { maxRows?: number } = {},
): Promise<{ profiles: number; rows: number; truncated: boolean; error?: string }> {
  const maxRows = opts.maxRows ?? 20000
  const db = createAdminClient()
  const byProfile = new Map<string, SignalForCompute[]>()
  let read = 0
  try {
    while (read < maxRows) {
      const { data, error } = await db
        .from('trust_signals')
        .select('profile_id, source, signal_type, context')
        // By profile first, so a profile's signals are contiguous and only the LAST one can be cut.
        .order('profile_id', { ascending: true })
        .order('id', { ascending: true })
        .range(read, read + RECOMPUTE_PAGE - 1)
      if (error) throw error
      const page = data ?? []
      for (const r of page) {
        const list = byProfile.get(r.profile_id) ?? []
        list.push({ source: r.source, signalType: r.signal_type, context: r.context })
        byProfile.set(r.profile_id, list)
      }
      read += page.length
      if (page.length < RECOMPUTE_PAGE) break
    }
    const truncated = read >= maxRows
    // A profile cut across the bound would be scored on part of its ledger: leave it to its own
    // next signal rather than write a wrong number.
    const now = new Date().toISOString()
    const rows = [...byProfile.entries()].flatMap(([profileId, signals]) =>
      computeScores(signals).rows.map((r) => ({
        profile_id: profileId,
        context: r.context,
        score: r.score,
        signal_count: r.signalCount,
        updated_at: now,
      })),
    )
    const safe = truncated ? rows.filter((r) => r.profile_id !== rows[rows.length - 1]?.profile_id) : rows
    for (let i = 0; i < safe.length; i += 500) {
      const { error } = await db.from('trust_scores').upsert(safe.slice(i, i + 500), { onConflict: 'profile_id,context' })
      if (error) throw error
    }
    return { profiles: byProfile.size, rows: safe.length, truncated }
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)
    return { profiles: byProfile.size, rows: 0, truncated: false, error: message }
  }
}


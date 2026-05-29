// Engagement event ledger — the SOURCE → LEDGER → RULES spine of
// docs/ENGAGEMENT-ARCHITECTURE.md. Records every reward-earning action EXACTLY
// ONCE (idempotency_key), then runs the EXISTING rules engine
// (processGamificationEvent) on first insert. Server-only (admin client).
//
// This sits IN FRONT of the current gamification system without replacing it:
// existing direct callers of processGamificationEvent keep working; new sources
// (web actions migrated here, plus physical QR/NFC/geo/p2p) flow through this so
// they gain persistence + exactly-once + a server-side verification hook.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { processGamificationEvent, type GamificationEvent } from '@/lib/achievements'

export type EngagementSource = 'web' | 'task' | 'qr' | 'nfc' | 'geo' | 'p2p' | 'system'

export interface RecordEngagementInput {
  /** Makes recording exactly-once across retries. */
  idempotencyKey: string
  source: EngagementSource
  /** Ledger event type (e.g. 'post_create', 'node_capture'). */
  eventType: string
  actorProfileId: string | null
  /** Per-source detail (node id, location, peer, …) — stored on the ledger row. */
  context?: Record<string, unknown>
  /** Set when a server-side verifier has already cleared a physical event. */
  verifiedAt?: Date
  /**
   * Optional: also run the rules engine (achievements / quests / challenges) on
   * first insert. Supply for sources that map to a typed GamificationEvent;
   * omit for sources (e.g. node captures) whose reward is granted directly.
   */
  gamificationEvent?: GamificationEvent
}

export interface RecordEngagementResult {
  /** false = duplicate idempotency_key; no reward granted this time. */
  recorded: boolean
}

/**
 * Append an engagement event to the ledger exactly once. Idempotent: a repeated
 * `idempotencyKey` is a no-op. On the first (real) insert, runs the rules engine
 * iff a `gamificationEvent` was supplied.
 */
export async function recordEngagementEvent(
  input: RecordEngagementInput,
): Promise<RecordEngagementResult> {
  const { idempotencyKey, source, eventType, actorProfileId, context, verifiedAt, gamificationEvent } = input

  // `engagement_events` isn't in the generated Database types until the migration
  // (20240215000000) is applied and types are regenerated. Until then, use an
  // untyped client view for this one table.
  const db = createAdminClient() as unknown as SupabaseClient

  // Exactly-once: ON CONFLICT DO NOTHING (ignoreDuplicates). A conflict returns
  // zero rows, so `recorded` is false and we skip the reward.
  const { data, error } = await db
    .from('engagement_events')
    .upsert(
      {
        idempotency_key: idempotencyKey,
        source,
        event_type: eventType,
        actor_profile_id: actorProfileId,
        context: context ?? {},
        verified_at: verifiedAt?.toISOString() ?? null,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    .select('id')

  if (error) throw error
  const recorded = (data?.length ?? 0) > 0

  // Run the existing rules engine only on the first insert, when supplied.
  if (recorded && gamificationEvent) await processGamificationEvent(gamificationEvent)

  return { recorded }
}

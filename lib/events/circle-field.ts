// Circle Field — collective (NOT competitive) gamification (EVENTS-SYSTEM §6.2).
//
// When a member checks into a circle-scoped event, we credit a small, fixed
// amount to that circle's shared seasonal standing — "our circle gathered N
// Field this season". This is the collaborative counterpart to the individual
// Zaps a check-in already pays; it is deliberately NOT an inter-circle ranking,
// and the standing is private by default (surfaced publicly only when the circle
// opts in via circles.resonance_public). Research backing in EVENTS-SYSTEM §4.
//
// Model mirrors the zaps ledger (ADR-139): award = ONE append-only row in
// circle_field_transactions; the after_circle_field_transaction trigger is the
// single place circles.current_season_field moves. Never write the total column
// directly. Server-only.
//
// The table + new column lag the generated Database types (same as lib/billing/*
// and lib/seasons.ts), so this module uses an untyped admin handle. Drop the cast
// after `supabase gen types` is re-run.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Fixed Circle Field credit per verified check-in to a circle event (per spec). */
export const CIRCLE_FIELD_AWARD = 10

/** Fixed Circle Field credit when a member completes a challenge the circle has
 *  adopted together (collaborative — see 20260611000000_circle_challenge_adoptions).
 *  A completed challenge is more effort than a single check-in, so it credits more. */
export const CIRCLE_FIELD_CHALLENGE_AWARD = 25

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/**
 * Credit Circle Field for a verified event check-in. Looks up the event; if it is
 * circle-scoped (scope_type = 'circle'), appends one circle_field_transactions row
 * crediting that circle CIRCLE_FIELD_AWARD, attributing the contribution to the
 * member who checked in. The trigger moves circles.current_season_field.
 *
 * Best-effort and idempotency-agnostic: the caller (events check-in) already gates
 * on recordEngagementEvent for exactly-once, so this only runs on a genuine first
 * check-in. Never throws — a Field credit must never break a check-in.
 */
export async function awardCircleFieldForCheckin(
  eventId: string,
  profileId: string,
): Promise<void> {
  try {
    const admin = db()

    const { data: event, error: lookupError } = await admin
      .from('events')
      .select('id, scope_type, scope_id')
      .eq('id', eventId)
      .maybeSingle()

    if (lookupError || !event) return
    // Only circle-scoped events feed a circle's Field (no-op otherwise).
    if (event.scope_type !== 'circle' || !event.scope_id) return

    const { error: insertError } = await admin
      .from('circle_field_transactions')
      .insert({
        circle_id: event.scope_id,
        event_id: event.id,
        profile_id: profileId,
        amount: CIRCLE_FIELD_AWARD,
      })

    if (insertError) console.error('[circle-field] credit failed:', insertError.message)
  } catch (e) {
    // Swallow — a Circle Field credit is never allowed to break a check-in.
    console.error('[circle-field] unexpected error:', e)
  }
}

/**
 * Credit Circle Field when `profileId` completes `challengeId`, for every circle
 * they are an active member of that has ADOPTED that challenge together
 * (circle_challenge_adoptions). This is the collaborative roll-up of the existing
 * per-member challenge engine: a member finishing a shared challenge advances the
 * whole circle's Field, exactly like showing up to a circle event does.
 *
 * Naturally exactly-once: the caller (advanceChallenges in lib/achievements.ts)
 * only invokes this on the genuine first completion (completed_at flips once, then
 * the engine short-circuits). Best-effort and never throws — a Field credit must
 * never break gamification processing.
 */
export async function awardCircleFieldForChallengeCompletion(
  challengeId: string,
  profileId: string,
): Promise<void> {
  try {
    const admin = db()

    // Circles that have taken on this challenge together…
    const { data: adoptedRows } = await admin
      .from('circle_challenge_adoptions')
      .select('circle_id')
      .eq('challenge_id', challengeId)
    const adoptedCircleIds = [
      ...new Set(((adoptedRows ?? []) as { circle_id: string }[]).map((r) => r.circle_id)),
    ]
    if (adoptedCircleIds.length === 0) return

    // …filtered to the ones this member is actually an active part of.
    const { data: memberRows } = await admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .in('circle_id', adoptedCircleIds)
    const circleIds = [
      ...new Set(((memberRows ?? []) as { circle_id: string }[]).map((r) => r.circle_id)),
    ]
    if (circleIds.length === 0) return

    const { error: insertError } = await admin
      .from('circle_field_transactions')
      .insert(
        circleIds.map((circle_id) => ({
          circle_id,
          event_id: null,
          profile_id: profileId,
          amount: CIRCLE_FIELD_CHALLENGE_AWARD,
        })),
      )

    if (insertError) console.error('[circle-field] challenge credit failed:', insertError.message)
  } catch (e) {
    console.error('[circle-field] unexpected error (challenge):', e)
  }
}

/**
 * Read a circle's collective Circle Field standing for the active season. This is
 * the running total maintained by the after_circle_field_transaction trigger
 * (circles.current_season_field), not a re-aggregation of the ledger.
 */
export async function getCircleFieldStanding(
  circleId: string,
): Promise<{ seasonField: number }> {
  const { data } = await db()
    .from('circles')
    .select('current_season_field')
    .eq('id', circleId)
    .maybeSingle()

  return { seasonField: (data?.current_season_field as number | null) ?? 0 }
}

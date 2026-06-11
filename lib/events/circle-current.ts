// Circle Current — collective (NOT competitive) gamification (EVENTS-SYSTEM §6.2).
//
// When a member checks into a circle-scoped event, we credit a small, fixed
// amount to that circle's shared seasonal standing — "our circle built N
// Current this season". This is the collaborative counterpart to the individual
// Zaps a check-in already pays; it is deliberately NOT an inter-circle ranking,
// and the standing is private by default (surfaced publicly only when the circle
// opts in via circles.resonance_public). Research backing in EVENTS-SYSTEM §4.
//
// Model mirrors the zaps ledger (ADR-139): award = ONE append-only row in
// circle_current_transactions; the after_circle_current_transaction trigger is the
// single place circles.season_current moves. Never write the total column
// directly. Server-only.
//
// The table + new column lag the generated Database types (same as lib/billing/*
// and lib/seasons.ts), so this module uses an untyped admin handle. Drop the cast
// after `supabase gen types` is re-run.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Fixed Circle Current credit per verified check-in to a circle event (per spec). */
export const CIRCLE_CURRENT_AWARD = 10

/** Fixed Circle Current credit when a member completes a challenge the circle has
 *  adopted together (collaborative — see 20260611000000_circle_challenge_adoptions).
 *  A completed challenge is more effort than a single check-in, so it credits more. */
export const CIRCLE_CURRENT_CHALLENGE_AWARD = 25

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/**
 * Credit Circle Current for a verified event check-in. Looks up the event; if it is
 * circle-scoped (scope_type = 'circle'), appends one circle_current_transactions row
 * crediting that circle CIRCLE_CURRENT_AWARD, attributing the contribution to the
 * member who checked in. The trigger moves circles.season_current.
 *
 * Best-effort and idempotency-agnostic: the caller (events check-in) already gates
 * on recordEngagementEvent for exactly-once, so this only runs on a genuine first
 * check-in. Never throws — a Current credit must never break a check-in.
 */
export async function awardCircleCurrentForCheckin(
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
    // Only circle-scoped events feed a circle's Current (no-op otherwise).
    if (event.scope_type !== 'circle' || !event.scope_id) return

    const { error: insertError } = await admin
      .from('circle_current_transactions')
      .insert({
        circle_id: event.scope_id,
        event_id: event.id,
        profile_id: profileId,
        amount: CIRCLE_CURRENT_AWARD,
      })

    if (insertError) console.error('[circle-current] credit failed:', insertError.message)
  } catch (e) {
    // Swallow — a Circle Current credit is never allowed to break a check-in.
    console.error('[circle-current] unexpected error:', e)
  }
}

/**
 * Credit Circle Current when `profileId` completes `challengeId`, for every circle
 * they are an active member of that has ADOPTED that challenge together
 * (circle_challenge_adoptions). This is the collaborative roll-up of the existing
 * per-member challenge engine: a member finishing a shared challenge advances the
 * whole circle's Current, exactly like showing up to a circle event does.
 *
 * Naturally exactly-once: the caller (advanceChallenges in lib/achievements.ts)
 * only invokes this on the genuine first completion (completed_at flips once, then
 * the engine short-circuits). Best-effort and never throws — a Current credit must
 * never break gamification processing.
 */
export async function awardCircleCurrentForChallengeCompletion(
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
      .from('circle_current_transactions')
      .insert(
        circleIds.map((circle_id) => ({
          circle_id,
          event_id: null,
          profile_id: profileId,
          amount: CIRCLE_CURRENT_CHALLENGE_AWARD,
        })),
      )

    if (insertError) console.error('[circle-current] challenge credit failed:', insertError.message)

    // Circle Current banner (Rewards Economy v2): the first shared-challenge
    // completion of the season banners the circle — emblem flair for every
    // active member, season-scoped. Idempotent via circle_awards UNIQUE.
    for (const circleId of circleIds) {
      const { data: season } = await admin
        .from('seasons')
        .select('season_number')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      const { error: awardError } = await admin.from('circle_awards').insert({
        circle_id: circleId,
        award_slug: 'circle_current_banner',
        season: (season as { season_number: number } | null)?.season_number ?? null,
      })
      if (awardError) continue // already bannered

      const { grantStoreItem } = await import('@/lib/awards/cosmetics')
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .eq('circle_id', circleId)
        .eq('status', 'active')
      for (const m of (members ?? []) as { profile_id: string }[]) {
        await grantStoreItem(m.profile_id, 'circle-current-banner').catch(() => {})
      }
    }
  } catch (e) {
    console.error('[circle-current] unexpected error (challenge):', e)
  }
}

/**
 * Read a circle's collective Circle Current standing for the active season. This is
 * the running total maintained by the after_circle_current_transaction trigger
 * (circles.season_current), not a re-aggregation of the ledger.
 */
export async function getCircleCurrentStanding(
  circleId: string,
): Promise<{ seasonCurrent: number }> {
  const { data } = await db()
    .from('circles')
    .select('season_current')
    .eq('id', circleId)
    .maybeSingle()

  return { seasonCurrent: (data?.season_current as number | null) ?? 0 }
}

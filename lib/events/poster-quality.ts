// The honesty metric — the deterministic anti-spam core of the Poster Events
// engine (server-only). A member who posts town events earns Zaps; this reads
// how their PAST posted events actually performed and scales the next reward.
// Posting events nobody shows up to, or that keep getting removed, drives the
// multiplier to zero. Posting events people RSVP to or that organizers claim
// keeps it at full. Pure-ish: one DB read, then deterministic band math.
//
// Bands (exact thresholds, evaluated top-down):
//   • throttled : posted >= 8 AND rate < 0.1, OR removed >= 2   → x0.0
//   • watch     : posted >= 5 AND rate < 0.2                    → x0.5
//   • new       : posted < 3                                    → x1.0
//   • trusted   : rate >= 0.5 OR claimed/posted >= 0.25         → x1.0
//   • neutral   : everything else (0.2 <= rate < 0.5)           → x1.0
//
// The reward floor is the live event_posted amount (zap_config, else the
// ZAP_AMOUNTS fallback) times the multiplier, rounded. The daily_cap on
// event_posted is enforced separately by awardZapsForAction.
//
// Anti-claim-farming: ENGAGEMENT is the dominant signal and the claim
// contribution is CAPPED. "engaged" counts events with a REAL RSVP from an
// ESTABLISHED member (membership/practice history, not just an RSVP), plus a
// capped lift from VALID claims only (claims that passed lib/events/claim-trust).
// A ring of reciprocal/sockpuppet claims therefore moves the band ZERO. The band
// thresholds/multipliers below are unchanged; they just read the hardened counts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ZAP_AMOUNTS } from '@/lib/zaps'

const db = () => createAdminClient() as unknown as SupabaseClient

export type PosterBand = 'new' | 'trusted' | 'neutral' | 'watch' | 'throttled'

export interface PosterQuality {
  band: PosterBand
  multiplier: number
  posted: number
  engaged: number
  claimed: number
  removed: number
  engagementRate: number
}

/** The raw per-poster counts the band math runs on. Shared with the draft store
 *  so "engaged / claimed / removed" mean exactly one thing across the feature. */
export interface PosterCounts {
  posted: number
  engaged: number
  claimed: number
  removed: number
}

/**
 * Pure band/multiplier math. Exported so it can be unit-tested with fixtures and
 * so callers can score hypothetical counts without a DB read. Evaluation order
 * matters: the punitive bands (throttled, watch) win before the lenient ones.
 */
export function scorePosterCounts(counts: PosterCounts): PosterQuality {
  const posted = Math.max(0, Math.floor(counts.posted))
  const engaged = Math.max(0, Math.floor(counts.engaged))
  const claimed = Math.max(0, Math.floor(counts.claimed))
  const removed = Math.max(0, Math.floor(counts.removed))
  const engagementRate = engaged / Math.max(posted, 1)
  const claimRate = claimed / Math.max(posted, 1)

  let band: PosterBand
  let multiplier: number

  if ((posted >= 8 && engagementRate < 0.1) || removed >= 2) {
    band = 'throttled'
    multiplier = 0.0
  } else if (posted >= 5 && engagementRate < 0.2) {
    band = 'watch'
    multiplier = 0.5
  } else if (posted < 3) {
    band = 'new'
    multiplier = 1.0
  } else if (engagementRate >= 0.5 || claimRate >= 0.25) {
    band = 'trusted'
    multiplier = 1.0
  } else {
    band = 'neutral'
    multiplier = 1.0
  }

  return { band, multiplier, posted, engaged, claimed, removed, engagementRate }
}

/**
 * Read a poster's published, posted-on-behalf events and count how they did.
 *
 * "Posted" = published events this profile posted that they do not host
 * themselves (source='poster_scan' OR host_id distinct from posted_by) — the
 * outreach posts, not their own hosted events.
 *
 * The hardened signals (anti-claim-farming):
 *   • ENGAGEMENT is the dominant signal: an event counts as "engaged" when it
 *     drew a REAL RSVP from an ESTABLISHED member (a 'going' RSVP by someone
 *     other than the poster who has community history beyond this one RSVP),
 *     OR when it was VALIDLY claimed (a claim that passed the trust gate, not a
 *     reciprocal/sockpuppet claim).
 *   • CLAIMED counts ONLY valid claims, and its contribution to "engaged" is
 *     CAPPED so a ring of fake claims cannot lift the band: claims can raise
 *     "engaged" only up to the count already earned by real RSVPs plus one.
 *     A poster with zero real RSVPs gets at most one engaged event from claims,
 *     so a fake-claim ring moves the band ZERO.
 *   • "Removed" = staff pulled it (spam/abuse); its own punitive signal.
 *
 * Shared by getPosterQuality + the clawback path so the definitions never drift.
 */
export async function getPosterCounts(profileId: string): Promise<PosterCounts> {
  const admin = db()

  // The poster's outreach events: published, posted by this profile, not their
  // own hosted event (host_id null = posted-on-behalf, or source poster_scan).
  const { data: events } = await admin
    .from('events')
    .select('id, host_id, claimed_at, removed_at, source')
    .eq('posted_by_profile_id', profileId)
    .eq('status', 'published')

  const rows = ((events ?? []) as Record<string, unknown>[]).filter((e) => {
    const hostId = (e.host_id as string | null) ?? null
    const source = (e.source as string | null) ?? null
    // Outreach post = captured from a poster, or posted for someone else (no self-host).
    return source === 'poster_scan' || hostId !== profileId
  })

  const posted = rows.length
  const ids = rows.map((e) => String(e.id))
  let removed = 0
  for (const e of rows) {
    if (e.removed_at) removed += 1
  }

  // Which of these events have a REAL RSVP from an established member? A 'going'
  // RSVP by anyone other than the poster, whose author has community history
  // beyond this RSVP, counts. (A brand-new account whose ONLY footprint is RSVPs
  // to this poster's events is treated as not-yet-established and ignored.)
  const realRsvpEventIds = new Set<string>()
  if (ids.length) {
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('event_id, profile_id, status')
      .in('event_id', ids)
      .eq('status', 'going')
    const rsvpRows = ((rsvps ?? []) as { event_id: string; profile_id: string }[]).filter(
      (r) => r.profile_id && r.profile_id !== profileId,
    )
    const rsvperIds = Array.from(new Set(rsvpRows.map((r) => String(r.profile_id))))
    const established = await establishedMembers(rsvperIds)
    for (const r of rsvpRows) {
      if (established.has(String(r.profile_id))) realRsvpEventIds.add(String(r.event_id))
    }
  }

  // Which claims were VALID (passed the trust gate at claim time)? Read the
  // event_claimed ledger rows and trust their recorded `valid` flag. Only valid
  // claims count toward claimed / engaged.
  const validClaimEventIds = await validClaimedEventIds(ids)
  let claimed = 0
  for (const e of rows) {
    if (e.claimed_at && validClaimEventIds.has(String(e.id))) claimed += 1
  }

  // Engagement = events with a real RSVP. Claims add to engaged but are CAPPED:
  // they can lift engaged only to (realEngaged + 1), so a fake-claim ring with no
  // real RSVPs yields at most one engaged event and never moves the band.
  let realEngaged = 0
  for (const e of rows) {
    if (realRsvpEventIds.has(String(e.id))) realEngaged += 1
  }
  let claimEngaged = 0
  for (const e of rows) {
    // A validly-claimed event with no real RSVP can add engagement, capped.
    if (validClaimEventIds.has(String(e.id)) && !realRsvpEventIds.has(String(e.id))) claimEngaged += 1
  }
  const cappedClaimEngaged = Math.min(claimEngaged, realEngaged + 1)
  const engaged = realEngaged + cappedClaimEngaged

  return { posted, engaged, claimed, removed }
}

/** Of these profile ids, which have community history beyond a single event
 *  RSVP? A member counts as established with any membership OR practice log. We
 *  deliberately do NOT count event RSVPs here, so a sockpuppet that only RSVPs to
 *  the poster's events never reads as established. */
async function establishedMembers(profileIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (!profileIds.length) return out
  const admin = db()

  const { data: members } = await admin
    .from('memberships')
    .select('profile_id')
    .in('profile_id', profileIds)
  for (const m of (members ?? []) as { profile_id: string }[]) {
    if (m.profile_id) out.add(String(m.profile_id))
  }

  const { data: logs } = await admin
    .from('practice_logs')
    .select('profile_id')
    .in('profile_id', profileIds)
  for (const l of (logs ?? []) as { profile_id: string }[]) {
    if (l.profile_id) out.add(String(l.profile_id))
  }

  return out
}

/** Of these event ids, which had a VALID claim recorded on the ledger. A claim
 *  is logged under event_claimed:<id> with a `valid` flag set by the claim trust
 *  gate; only valid claims count toward quality. */
async function validClaimedEventIds(eventIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (!eventIds.length) return out
  const keys = eventIds.map((id) => `event_claimed:${id}`)
  const { data } = await db()
    .from('engagement_events')
    .select('idempotency_key, context')
    .in('idempotency_key', keys)
  for (const row of (data ?? []) as { idempotency_key: string; context?: { valid?: boolean; eventId?: string } }[]) {
    const ctx = row.context ?? {}
    if (ctx.valid === true) {
      const id = ctx.eventId ?? String(row.idempotency_key).replace(/^event_claimed:/, '')
      out.add(String(id))
    }
  }
  return out
}

/** The poster's honesty band + multiplier + the counts behind it. */
export async function getPosterQuality(profileId: string): Promise<PosterQuality> {
  const counts = await getPosterCounts(profileId)
  return scorePosterCounts(counts)
}

/** Read the live base event_posted amount (zap_config), falling back to the
 *  in-code amount when the config row is missing or the action is disabled. */
async function basePostReward(): Promise<number> {
  try {
    const { data } = await db()
      .from('zap_config')
      .select('zaps_amount, is_active')
      .eq('action_type', 'event_posted')
      .maybeSingle()
    const cfg = data as { zaps_amount?: number; is_active?: boolean } | null
    if (cfg && cfg.is_active === false) return 0
    return cfg?.zaps_amount ?? ZAP_AMOUNTS.event_posted
  } catch {
    return ZAP_AMOUNTS.event_posted
  }
}

export interface ScaledPostReward extends PosterQuality {
  baseAmount: number
  /** The amount to award (base * multiplier, rounded). 0 means skip the award. */
  amount: number
}

/**
 * The scaled event_posted reward for this poster: base * honesty multiplier,
 * rounded. The daily_cap stays enforced by awardZapsForAction. A multiplier of 0
 * (throttled) yields amount 0, which the publish path treats as "skip the award".
 */
export async function scaledPostReward(profileId: string): Promise<ScaledPostReward> {
  const quality = await getPosterQuality(profileId)
  const baseAmount = await basePostReward()
  const amount = Math.round(baseAmount * quality.multiplier)
  return { ...quality, baseAmount, amount }
}

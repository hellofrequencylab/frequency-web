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
 * "Posted" = published events this profile posted that they do not host
 * themselves (source='poster_scan' OR host_id distinct from posted_by) — the
 * outreach posts, not their own hosted events. "Engaged" = at least one RSVP, or
 * claimed, or removed-but-was-engaged is NOT counted (removed is its own signal).
 * "Claimed" = an organizer took it over. "Removed" = staff pulled it (spam/abuse).
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
  let claimed = 0
  let removed = 0
  for (const e of rows) {
    if (e.claimed_at) claimed += 1
    if (e.removed_at) removed += 1
  }

  // Engaged = has at least one RSVP, OR was claimed. Claimed events are engaged
  // by definition (an organizer took them over). Count RSVP'd event ids once.
  const rsvpIds = new Set<string>()
  if (ids.length) {
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', ids)
    for (const r of (rsvps ?? []) as { event_id: string }[]) {
      rsvpIds.add(String(r.event_id))
    }
  }
  let engaged = 0
  for (const e of rows) {
    if (rsvpIds.has(String(e.id)) || e.claimed_at) engaged += 1
  }

  return { posted, engaged, claimed, removed }
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

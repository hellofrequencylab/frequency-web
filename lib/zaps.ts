// Zaps award engine — the external / in-person counterpart to awardGems.
//
// Currency model (docs/GLOSSARY.md): GEMS reward internal, on-platform web
// engagement; ZAPS reward external + in-person activity — outreach, invites,
// in-person events, ghost-node captures, business/NFC programs. At season end,
// reset_season() converts a rank-based share of season zaps into gems, which buy
// digital badges and trade for physical merch in the web store.
//
// Mirrors the direct current_season_zaps + lifetime_zaps update used by the
// challenge/quest engine in lib/achievements.ts (season rank advances via the
// existing DB logic). Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { rankForZaps } from '@/lib/season-ranks'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

// Fallback base zap amounts for external / in-person actions. The live, tunable
// numbers come from the `zap_config` table (awardZapsForAction); these are only
// used if a config row is missing, so a grant never breaks. Attendance is awarded
// at verified check-in (ROADMAP P2.13), NOT at RSVP (RSVP is a web action = gems).
// Fallback base zap amounts (mirror the live zap_config rows — see the
// 20260605100000_economy_rebalance migration / ADR-104). Only used if a config
// row is missing, so a grant never breaks.
export const ZAP_AMOUNTS = {
  circle_start: 100,
  event_host: 60,
  circle_activate: 40,
  invite_accepted: 40,
  event_attend: 25,
  outreach_task: 20,
  practice_logged: 12,
  practice_claim: 10,
  node_capture: 10,
  program_run: 30,
  // Entry Points (ADR-126): reward setting up a funnel (capped in app to the first
  // few per member) + the activate bonus when a member you brought in shows up.
  entry_point_created: 20,
  referral_activated: 25,
} as const

export type ZapAction = keyof typeof ZAP_AMOUNTS

export interface ZapAwardResult {
  awarded: boolean
  amount: number
}

/**
 * Add `amount` zaps to a profile's current season + lifetime totals. Use for
 * verified external / in-person engagement. Amounts come from the reward economy
 * (config), not from here. Idempotency is the caller's responsibility — drive
 * grants through recordEngagementEvent (lib/engagement/events.ts) for
 * exactly-once.
 */
export async function awardZaps(profileId: string, amount: number): Promise<ZapAwardResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { awarded: false, amount: 0 }

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('current_season_zaps, lifetime_zaps')
    .eq('id', profileId)
    .maybeSingle()

  const p = data as Pick<ProfileRow, 'current_season_zaps' | 'lifetime_zaps'> | null

  const newSeasonZaps = (p?.current_season_zaps ?? 0) + amount

  await admin
    .from('profiles')
    .update({
      current_season_zaps: newSeasonZaps,
      lifetime_zaps: (p?.lifetime_zaps ?? 0) + amount,
      // Keep the season rank in lockstep with the zaps total so the tally never
      // drifts (the previous code left current_season_rank stale).
      current_season_rank: rankForZaps(newSeasonZaps),
    })
    .eq('id', profileId)

  return { awarded: true, amount }
}

/**
 * Award zaps for a named action, reading the amount from the tunable `zap_config`
 * table (falls back to ZAP_AMOUNTS if the row is missing). Use this for fixed-value
 * actions; pass an explicit amount to `awardZaps` directly for dynamic values (e.g.
 * a node's own `zaps_value`). Idempotency stays the caller's responsibility (drive
 * through recordEngagementEvent for exactly-once).
 */
export async function awardZapsForAction(
  profileId: string,
  action: ZapAction,
  overrideAmount?: number,
): Promise<ZapAwardResult> {
  const admin = createAdminClient()

  // `zap_config` is a new table; until `supabase gen types` is re-run it is not in
  // the generated Database types, so read it through an untyped handle. Drop the
  // cast once types are regenerated (see docs/START-HERE.md).
  const { data } = await (admin as unknown as SupabaseClient)
    .from('zap_config')
    .select('zaps_amount, is_active')
    .eq('action_type', action)
    .maybeSingle()
  const cfg = data as { zaps_amount: number; is_active: boolean } | null

  if (cfg && !cfg.is_active) return { awarded: false, amount: 0 }
  const amount = overrideAmount ?? cfg?.zaps_amount ?? ZAP_AMOUNTS[action]
  return awardZaps(profileId, amount)
}

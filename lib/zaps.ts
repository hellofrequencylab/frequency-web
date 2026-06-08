// Zaps award engine — the external / in-person counterpart to awardGems.
//
// Currency model (docs/GLOSSARY.md): GEMS reward internal, on-platform web
// engagement; ZAPS reward external + in-person activity — outreach, invites,
// in-person events, ghost-node captures, business/NFC programs. At season end,
// reset_season() converts a rank-based share of season zaps into gems, which buy
// digital badges and trade for physical merch in the web store.
//
// Every grant is one row in the `zap_transactions` ledger; the
// `after_zap_transaction` trigger is the single place season + lifetime totals
// move and the season rank advances (mirrors gems / gem_transactions). This is
// also what powers the Vault "how you earned" log (ADR-139). Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { BETA_MEMBERS_GET_CREW } from '@/lib/onboarding/beta-script'
import { isPaid, type EntitlementTier } from '@/lib/core/entitlement'

// Free members climb the zap ladder at a reduced rate; Crew earn full rate
// (ECONOMY-AND-JOURNEYS §6 — locked). Gems stay easy for everyone; only zaps are
// throttled. In Beta everyone is Crew (BETA_MEMBERS_GET_CREW), so this is inert
// until that flag flips off at Launch. Tunable here.
export const MEMBER_ZAP_RATE = 0.5

/** Apply the member zap-rate to a base amount. Paid (Crew, and all of Beta) earn full;
 *  a free member earns `MEMBER_ZAP_RATE` of it (floored, but never below 1 so a
 *  grant is never silently zeroed). Gated on the membership TIER, not the role; one
 *  lookup, skipped entirely in Beta. */
async function effectiveZaps(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  amount: number,
): Promise<number> {
  if (BETA_MEMBERS_GET_CREW) return amount
  const { data } = await admin.from('profiles').select('membership_tier').eq('id', profileId).maybeSingle()
  if (isPaid((data?.membership_tier ?? 'free') as EntitlementTier)) return amount
  return Math.max(1, Math.floor(amount * MEMBER_ZAP_RATE))
}

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

export interface AwardZapsOpts {
  /** Ledger label for the "how you earned" log (defaults to 'manual'). */
  actionType?: string
  /** Extra context stored on the ledger row (node id, achievement slug, …). */
  metadata?: Record<string, unknown>
}

/**
 * Grant `amount` zaps to a profile by appending a row to the zap ledger
 * (`zap_transactions`). The `after_zap_transaction` trigger is the single place
 * season + lifetime totals and the season rank advance — so every grant is
 * recorded (powering the Vault points log) and the rank never drifts. Use for
 * verified external / in-person engagement. Idempotency is the caller's
 * responsibility — drive grants through recordEngagementEvent
 * (lib/engagement/events.ts) for exactly-once.
 */
export async function awardZaps(
  profileId: string,
  amount: number,
  opts: AwardZapsOpts = {},
): Promise<ZapAwardResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { awarded: false, amount: 0 }

  const admin = createAdminClient()
  // Free members earn zaps at a reduced rate (ADR-140 / ECONOMY §6); inert in Beta.
  const finalAmount = await effectiveZaps(admin, profileId, amount)
  const { error } = await admin
    .from('zap_transactions')
    .insert({
      profile_id: profileId,
      action_type: opts.actionType ?? 'manual',
      amount: finalAmount,
      metadata: (opts.metadata ?? {}) as Database['public']['Tables']['zap_transactions']['Insert']['metadata'],
    })

  if (error) {
    console.error('[awardZaps]', error.message)
    return { awarded: false, amount: 0 }
  }

  return { awarded: true, amount: finalAmount }
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

  const { data: cfg } = await admin
    .from('zap_config')
    .select('zaps_amount, is_active')
    .eq('action_type', action)
    .maybeSingle()

  if (cfg && !cfg.is_active) return { awarded: false, amount: 0 }
  const amount = overrideAmount ?? cfg?.zaps_amount ?? ZAP_AMOUNTS[action]
  return awardZaps(profileId, amount, { actionType: action })
}

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

// Rewards Economy v2: everyone earns Zaps at full rate. The free game is the
// principle; ADR-141 visibility gating is the membership value. (The old
// MEMBER_ZAP_RATE = 0.5 throttle was inert in Beta and is deleted, not paused.)

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
  // Practice logging pays by the practice's weight class (Rewards Economy v2);
  // 'practice_logged' is the standard class.
  practice_logged: 12,
  practice_logged_light: 8,
  practice_logged_heavy: 15,
  practice_claim: 10,
  node_capture: 10,
  program_run: 30,
  // Entry Points (ADR-126): reward setting up a funnel (capped in app to the first
  // few per member) + the activate bonus when a member you brought in shows up.
  entry_point_created: 20,
  referral_activated: 25,
  // Rewards Economy v2 bonuses (granted idempotently via reward_grants).
  co_op_pulse: 3,
  welcome_back: 10,
  practice_full_cycle: 50,
  // Poster events: publishing a town event you captured from a poster (the base,
  // before the honesty multiplier in lib/events/poster-quality.ts) + the bonus
  // paid to the poster when an organizer claims it. Both are real-world/outreach.
  event_posted: 20,
  event_claim_bonus: 30,
  // Joining (ADR-232): every new member starts with a grant, and joining through
  // a friend's link pays the NEWCOMER a bonus on top (the inviter's
  // invite_accepted above is the other half of that handshake).
  community_join: 10,
  referred_join_bonus: 15,
  // The Quest (ADR-Quest completion model): finishing a Journey pays a flat purse
  // (the Gem rank-bonus + Trophy are granted by lib/quest/complete.ts), and an
  // Expression Challenge done in person at a Circle pays Zaps (mirrors
  // QUEST.JOURNEY_FINISH_ZAPS / QUEST.EXPRESSION_CIRCLE_ZAPS in lib/gamification.ts).
  journey_finished: 75,
  expression_challenge: 50,
} as const

/** Zap action for a practice's weight class (the per-log payout driver). */
export function practiceLogAction(weightClass: string | null | undefined): ZapAction {
  if (weightClass === 'light') return 'practice_logged_light'
  if (weightClass === 'heavy') return 'practice_logged_heavy'
  return 'practice_logged'
}

/** The per-log Zap value for a practice's weight class — the display fallback (the award path
 *  reads the live amount from zap_config via practiceLogAction). One source for the value. */
export function practiceLogZaps(weightClass: string | null | undefined): number {
  return ZAP_AMOUNTS[practiceLogAction(weightClass)]
}

/** The per-log Zap value a practice actually pays. `reward_zaps`, when set, is an explicit
 *  per-practice override (the Quest library uses it to value practices by CADENCE, not effort:
 *  Daily 10 / 3x-week 15 / Weekly 25); otherwise the weight-class default applies. One source
 *  of truth for both the award path (lib/practices.logPractice) and every display. */
export function practiceZapValue(p: {
  reward_zaps?: number | null
  weight_class?: string | null
}): number {
  if (typeof p.reward_zaps === 'number' && p.reward_zaps > 0) return Math.floor(p.reward_zaps)
  return practiceLogZaps(p.weight_class)
}

export type ZapAction = keyof typeof ZAP_AMOUNTS

export interface ZapAwardResult {
  awarded: boolean
  amount: number
  /** True ONLY when the award was refused because the action's `zap_config.daily_cap` is
   *  already spent for this UTC day (award_zaps_atomic, 20270322000000). Mirrors the `capped`
   *  flag on the Gem path's AwardResult, but stays OPTIONAL here on purpose: several callers
   *  already write `.catch(() => ({ awarded: false, amount: 0 }))` as their failure fallback
   *  (lib/qr/referral.ts), and a required third field would make
   *  those literals stop type-checking for no gain. Absent means "not a cap refusal". */
  capped?: boolean
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
 *
 * ⚠️ NO DAILY CAP HERE. `zap_config.daily_cap` is enforced by `awardZapsForAction`, the
 * config-driven entry point (the mirror of `awardGems`). This one takes a caller-computed
 * amount and has no config row to read a cap from. Rows it writes still COUNT toward the
 * day's allowance for the same `actionType`, because award_zaps_atomic counts ledger rows and
 * cannot tell which path wrote them — so a partial practice log (1 Zap, written here) spends
 * the practice_logged allowance that a later full log would have used.
 */
export async function awardZaps(
  profileId: string,
  amount: number,
  opts: AwardZapsOpts = {},
): Promise<ZapAwardResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { awarded: false, amount: 0 }

  const admin = createAdminClient()
  const finalAmount = Math.floor(amount)
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

export interface ReverseZapsResult {
  reversed: boolean
  /** The (negative) amount written to the ledger, or 0 when nothing to reverse. */
  amount: number
}

/**
 * Reverse a prior Zap grant by appending a COMPENSATING negative row to the ledger
 * (`zap_transactions`). The `after_zap_transaction` trigger is still the single place
 * totals move, so it subtracts the debit from season + lifetime zaps the same way a
 * grant adds (rank is monotonic by design and never demotes — a small today-only
 * un-log is well inside that contract; WEBSITE-CHANGES-PLAN §3 B.1).
 *
 * This is the negative-aware sibling of `awardZaps` (which REJECTS amount <= 0, so it
 * cannot debit). Pass the POSITIVE amount that was originally granted; this inserts
 * `-amount`. A zero / non-finite amount is a safe no-op (nothing to reverse).
 *
 * Idempotency is the caller's responsibility: `unlogPractice` only ever calls this
 * once per log (the engagement_events idempotency row + practice_logs row are deleted
 * in the same un-log, so the log can't be un-logged twice). The `actionType` defaults
 * to a debit-marked label so the Vault "how you earned" log reads it as a reversal.
 */
export async function reverseZaps(
  profileId: string,
  amount: number,
  opts: AwardZapsOpts = {},
): Promise<ReverseZapsResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { reversed: false, amount: 0 }

  const admin = createAdminClient()
  const debit = -Math.floor(amount)
  const { error } = await admin
    .from('zap_transactions')
    .insert({
      profile_id: profileId,
      action_type: opts.actionType ?? 'practice_log_reversed',
      amount: debit,
      metadata: (opts.metadata ?? {}) as Database['public']['Tables']['zap_transactions']['Insert']['metadata'],
    })

  if (error) {
    console.error('[reverseZaps]', error.message)
    return { reversed: false, amount: 0 }
  }

  return { reversed: true, amount: debit }
}

/**
 * Award zaps for a named action, reading the amount AND the daily cap from the tunable
 * `zap_config` table (falls back to ZAP_AMOUNTS if the row is missing). Use this for
 * fixed-value actions; pass an explicit amount to `awardZaps` directly for dynamic values
 * (e.g. a node's own `zaps_value`). Idempotency stays the caller's responsibility (drive
 * through recordEngagementEvent for exactly-once).
 *
 * ── daily_cap IS ENFORCED HERE, AND UNTIL 2026-08-24 IT WAS NOT ENFORCED ANYWHERE ──────────
 * This function used to select `zaps_amount, is_active` and nothing else; the string
 * `daily_cap` did not appear in this file at all, while /admin/gamification happily let a
 * janitor set one. An operator set a throttle, the UI confirmed it, and the engine never
 * asked — ADR-970's named failure, a switch that gates nothing reading as coverage. Two
 * production rows carried an inert cap when this landed: practice_logged (12 Zaps, cap 1)
 * and event_posted (20 Zaps, cap 3). Both are live from this change forward.
 *
 * The cap-check and the insert happen INSIDE one Postgres function under a per-(profile,
 * action) advisory lock (`award_zaps_atomic`, migration 20270322000000, UTC day boundary).
 * That is not gold-plating: the Gem path shipped the obvious count-then-insert first and it
 * was a race — N concurrent awards at cap-1 all read the same count and all inserted, past
 * the cap. This mirrors the FIXED shape, deliberately. A NULL cap means uncapped.
 *
 * ⚠️ SCOPE. The cap binds on THIS entry point only — the config-driven one, the mirror of
 * `awardGems`. `awardZaps(profileId, amount, opts)` still inserts directly, because it has no
 * config row behind it (a node's own value, a partial practice log, a finish top-up delta).
 * Rows it writes DO count toward the day's allowance, since award_zaps_atomic counts ledger
 * rows by action_type regardless of which path wrote them. And `reverseZaps` debits under a
 * different action_type, so an un-log does not hand the allowance back.
 */
export async function awardZapsForAction(
  profileId: string,
  action: ZapAction,
  overrideAmount?: number,
): Promise<ZapAwardResult> {
  const admin = createAdminClient()

  const { data: cfg } = await admin
    .from('zap_config')
    .select('zaps_amount, daily_cap, is_active')
    .eq('action_type', action)
    .maybeSingle()

  // An explicitly inactive action awards nothing. NOTE the deliberate difference from gems,
  // which reads `!config?.is_active` and so pays nothing when the row is MISSING: a missing
  // `zap_config` row here keeps falling back to the static ZAP_AMOUNTS default, so a grant
  // never breaks on a config gap. That fallback predates this change and survives it.
  if (cfg && !cfg.is_active) return { awarded: false, amount: 0 }

  const requested = overrideAmount ?? cfg?.zaps_amount ?? ZAP_AMOUNTS[action]
  if (!Number.isFinite(requested) || requested <= 0) return { awarded: false, amount: 0 }
  const amount = Math.floor(requested)

  // The RPC is not in the generated types yet, so the call is cast (repo convention for
  // not-yet-typed DB objects). `.bind(admin)` is mandatory, not stylistic: SupabaseClient.rpc
  // opens by reading `this.rest`, and a detached alias threw `Cannot read properties of
  // undefined (reading 'rest')` in production for six weeks (LIVE-053 / LIVE-061, digest
  // 3920664382). scripts/check-detached-client-methods.test.ts fails the build if it comes back.
  const rpc = admin.rpc.bind(admin) as unknown as (
    name: 'award_zaps_atomic',
    args: {
      _profile: string
      _action: string
      _amount: number
      _daily_cap: number | null
      _metadata: Record<string, unknown>
    },
  ) => Promise<{ data: { awarded?: boolean; capped?: boolean } | null; error: { message: string } | null }>

  const { data, error } = await rpc('award_zaps_atomic', {
    _profile: profileId,
    _action: action,
    _amount: amount,
    // NULL cap = uncapped, exactly as for Gems. `?? null` and not `|| null`: a cap of 0 is a
    // real setting (pay nothing) and must not be coerced into "unlimited".
    _daily_cap: cfg?.daily_cap ?? null,
    _metadata: {},
  })

  if (error) {
    // FAIL CLOSED — award nothing. Matches lib/gems.ts, and the direction is the whole point of
    // this change: falling back to a raw `awardZaps` insert here would pay the Zaps UNCAPPED,
    // i.e. it would silently restore the exact defect being fixed, and it would do so precisely
    // when nobody is looking. An unpaid Zap is a support ticket; an uncapped one is the bug.
    //
    // THE GATE THAT NOTICES IT FIRED (AGENTS.md — a swallowed error is an invisible regression):
    // console.error alone is pull-only, and this repo has already watched a pull-only signal go
    // unread for five weeks (LIVE-091). So the fail-safe also reports to Sentry, tagged, through
    // a DYNAMIC import so `@sentry/nextjs` never enters this module's static graph (lib/zaps.ts
    // is reachable from a lot of server code, and ADR-1074 is the record of what a stray static
    // import here costs). Fire-and-forget and swallowed: observability may never break the path
    // it observes.
    console.error('[awardZapsForAction] award_zaps_atomic failed, awarding nothing', action, error.message)
    void import('@sentry/nextjs')
      .then((S) =>
        S.captureException(new Error(`award_zaps_atomic failed: ${error.message}`), {
          tags: { area: 'rewards', currency: 'zaps', zap_action: action, failsafe: 'fail_closed' },
        }),
      )
      .catch(() => {})
    return { awarded: false, amount: 0 }
  }

  const awarded = !!data?.awarded
  return { awarded, amount: awarded ? amount : 0, capped: !!data?.capped }
}

/**
 * READ (never award) the LIVE per-action Zap amount from the tunable `zap_config`
 * table, falling back to the static ZAP_AMOUNTS default. This is the read-only sibling
 * of `awardZapsForAction`, so a caller that needs to SIZE a payout (e.g. the practice
 * finish top-up computing the remaining delta) reads the same live number the award
 * path would pay, instead of the static default. An inactive action reads 0. Best-effort:
 * any read failure falls back to the static default.
 */
export async function zapAmountForAction(action: ZapAction): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data: cfg } = await admin
      .from('zap_config')
      .select('zaps_amount, is_active')
      .eq('action_type', action)
      .maybeSingle()
    if (cfg && !cfg.is_active) return 0
    return cfg?.zaps_amount ?? ZAP_AMOUNTS[action]
  } catch {
    return ZAP_AMOUNTS[action]
  }
}

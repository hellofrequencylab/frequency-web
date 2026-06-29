// Creation rewards (Rewards Economy v3, Option B "validated creation" — ADR-305 /
// REWARDS-ECONOMY.md §5).
//
// Creation pays in TWO beats, so we reward contribution that actually helps someone, not
// raw volume:
//   1. On FIRST PUBLISH  → a small Gem creation TOKEN (awardCreationToken). First publish
//      only — never on edits or duplicates. Soft cap: 3 creation tokens / day.
//   2. On FIRST USE by a distinct, ESTABLISHED member → the large VALIDATED payout
//      (awardValidatedCreation): the validated Zaps PLUS the validated Gem bonus, paid to
//      the CREATOR (the beneficiary) off the other member's (the actor's) use. Paid exactly
//      once per asset, ever.
//
// "Used" means: a Journey is ADOPTED, a practice is LOGGED, an event is RSVP'd. The use
// hook is wired at each of those sites (lib/journey-plans.adoptPlan, lib/practices.logPractice,
// app/(main)/events/actions.toggleRSVP|setRsvpStatus). The validation gate is the throttle, so
// the validated payout is UNCAPPED.
//
// Idempotency is the same claim-then-pay reward_grants pattern the rest of the economy uses
// (lib/quest/complete.ts, lib/journeys/grants.ts): insert the reward_grants row FIRST, keyed
// by a stable rule_key; a unique_violation means "already paid" → stop. Both the token and
// each currency leg of the validated payout claim their own row before writing the ledger.
//
// Everything here is BEST-EFFORT: every public entry wraps in try/catch and NEVER throws to
// the caller — a reward must never block or fail a publish / adopt / log / RSVP. Server-only
// (admin client = service_role, which bypasses prevent_economy_self_edit). The payout amounts
// live here as the source-of-truth registry (REWARDS-ECONOMY.md §3–§4); a tuning migration
// seeds the matching zap_config / gem_config rows for the live, adjustable numbers.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardZaps } from '@/lib/zaps'
import { awardGems } from '@/lib/gems'

function db(): SupabaseClient {
  return createAdminClient()
}

/** The three creatable asset kinds the economy rewards. */
export type CreationAssetType = 'journey' | 'event' | 'practice'

/** The small Gem token paid on FIRST publish, per asset type (REWARDS-ECONOMY.md §4). */
const TOKEN_GEMS: Record<CreationAssetType, number> = {
  journey: 5,
  event: 5,
  practice: 3,
}

/** The large VALIDATED-creation payout, per asset type (REWARDS-ECONOMY.md §3–§4). The
 *  Zaps action types mirror zap_config; the Gem bonus action types mirror gem_config. */
const VALIDATED: Record<
  CreationAssetType,
  { zaps: number; zapAction: string; gems: number; gemAction: 'create_journey_bonus' | 'create_event_bonus' | 'create_practice_bonus' }
> = {
  journey: { zaps: 100, zapAction: 'create_journey', gems: 25, gemAction: 'create_journey_bonus' },
  event: { zaps: 50, zapAction: 'create_event', gems: 10, gemAction: 'create_event_bonus' },
  practice: { zaps: 40, zapAction: 'create_practice', gems: 10, gemAction: 'create_practice_bonus' },
}

/** The gem action_type for a token, per asset type. */
const TOKEN_GEM_ACTION: Record<CreationAssetType, 'create_journey_token' | 'create_event_token' | 'create_practice_token'> = {
  journey: 'create_journey_token',
  event: 'create_event_token',
  practice: 'create_practice_token',
}

/** Soft daily cap on creation tokens (REWARDS-ECONOMY.md §4). */
const TOKEN_DAILY_CAP = 3

/**
 * Pay the small Gem creation TOKEN on FIRST publish only. Idempotent via the reward_grants
 * rule_key `create_token:{assetType}:{assetId}` (insert the grant row first; on
 * unique_violation, stop — it was already paid, e.g. a re-publish or duplicate edit). Soft
 * daily cap: if the creator already has >= 3 reward_grants rows keyed `create_token:%` dated
 * today, the token is skipped (a no-op, never an error). Best-effort: never throws.
 *
 * @returns the Gems newly granted (0 when already paid, capped, or on any failure).
 */
export async function awardCreationToken(
  creatorId: string,
  assetType: CreationAssetType,
  assetId: string,
): Promise<number> {
  try {
    if (!creatorId || !assetId) return 0
    const amount = TOKEN_GEMS[assetType]
    if (!amount || amount <= 0) return 0
    const admin = db()
    const ruleKey = `create_token:${assetType}:${assetId}`

    // Soft daily cap: count today's creation-token grants for this creator. Checked
    // BEFORE the claim so a capped creator doesn't burn the per-asset rule_key (their
    // grant row would block the token if they later free up cap — but per spec a capped
    // token is simply skipped, no error, and the asset only ever pays its token once).
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await admin
      .from('reward_grants')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', creatorId)
      .like('rule_key', 'create_token:%')
      .gte('granted_at', todayStart.toISOString())
    if ((count ?? 0) >= TOKEN_DAILY_CAP) return 0

    // Claim-then-pay: the unique (rule_key, profile_id) insert is the lock. Only a fresh
    // claim writes the gem ledger, so a re-publish / redelivery never double-pays.
    const { error } = await admin.from('reward_grants').insert({
      rule_key: ruleKey,
      profile_id: creatorId,
      reward_kind: 'gems',
      amount,
      detail: `Creation token: ${assetType}`,
    })
    if (error) return 0 // already granted / lost the race

    const res = await awardGems(creatorId, TOKEN_GEM_ACTION[assetType], amount, {
      rule: ruleKey,
      assetType,
      assetId,
    })
    return res.awarded ? res.amount : 0
  } catch (err) {
    console.error('[awardCreationToken]', err instanceof Error ? err.message : err)
    return 0
  }
}

/**
 * Whether a validator counts as an ESTABLISHED member for validated creation
 * (REWARDS-ECONOMY.md §5): distinct from the creator, email-verified, and NOT invited by
 * the creator. Email verification lives on auth.users (email_confirmed_at), reached via
 * profiles.auth_user_id; the invite chain is profiles.referred_by_profile_id. Best-effort:
 * any read failure fails CLOSED (returns false) so we never pay on an unverifiable validator.
 */
async function isEstablishedValidator(
  admin: SupabaseClient,
  creatorId: string,
  validatorId: string,
): Promise<boolean> {
  // Distinct member.
  if (!validatorId || validatorId === creatorId) return false

  const { data: profile } = await admin
    .from('profiles')
    .select('auth_user_id, referred_by_profile_id')
    .eq('id', validatorId)
    .maybeSingle()
  const p = profile as { auth_user_id: string | null; referred_by_profile_id: string | null } | null
  if (!p?.auth_user_id) return false

  // Not invited by the creator (the invite chain on profiles).
  if (p.referred_by_profile_id && p.referred_by_profile_id === creatorId) return false

  // Email-verified — the auth.users record carries email_confirmed_at.
  const { data: userRes } = await admin.auth.admin.getUserById(p.auth_user_id)
  const confirmedAt = (userRes?.user as { email_confirmed_at?: string | null } | null | undefined)?.email_confirmed_at
  if (!confirmedAt) return false

  return true
}

/** Claim-then-pay one currency leg of the validated payout. The unique (rule_key,
 *  profile_id) insert is the lock; only a fresh claim writes the ledger. */
async function claimAndPay(
  admin: SupabaseClient,
  ruleKey: string,
  beneficiaryId: string,
  kind: 'zaps' | 'gems',
  amount: number,
  detail: string,
  pay: () => Promise<boolean>,
): Promise<boolean> {
  if (amount <= 0) return false
  const { error } = await admin.from('reward_grants').insert({
    rule_key: ruleKey,
    profile_id: beneficiaryId,
    reward_kind: kind,
    amount,
    detail,
  })
  if (error) return false // already granted / lost the race
  // The claim is the lock, but the payout must actually land. If pay() reports failure
  // (or throws), release the claim so a later use can re-pay this leg — otherwise the
  // lock is permanent and the currency is never credited (claimed-but-unpaid).
  let paid = false
  try {
    paid = await pay()
  } catch (err) {
    await admin.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', beneficiaryId)
    throw err
  }
  if (!paid) {
    await admin.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', beneficiaryId)
    return false
  }
  return true
}

export interface ValidatedCreationResult {
  paid: boolean
  zaps: number
  gems: number
}

/**
 * Pay the large VALIDATED-creation payout when an asset is first USED by a distinct,
 * established member (REWARDS-ECONOMY.md §5). The CREATOR is the beneficiary; the validator
 * is the actor. Paid exactly once per asset, ever, via reward_grants rule_key
 * `creation_validated:{assetType}:{assetId}` — claim-then-pay for BOTH currencies (each leg
 * claims its own row so a partial failure can self-heal on a later use). Uncapped (the
 * validation gate is the throttle). Best-effort: never throws to the caller.
 *
 * Returns `{ paid, zaps, gems }`. `paid: false` when the validator isn't established, the
 * asset was already validated, or anything failed.
 */
export async function awardValidatedCreation(
  creatorId: string,
  assetType: CreationAssetType,
  assetId: string,
  validatorId: string,
): Promise<ValidatedCreationResult> {
  const none: ValidatedCreationResult = { paid: false, zaps: 0, gems: 0 }
  try {
    if (!creatorId || !assetId || !validatorId) return none
    const admin = db()

    // Gate: a distinct, email-verified member who wasn't invited by the creator.
    if (!(await isEstablishedValidator(admin, creatorId, validatorId))) return none

    const cfg = VALIDATED[assetType]
    if (!cfg) return none
    const baseKey = `creation_validated:${assetType}:${assetId}`
    const meta = { rule: baseKey, assetType, assetId, validatorId }

    // Zaps leg → the creator. Claim-then-pay through its own reward_grants row.
    const zaps = (await claimAndPay(
      admin,
      `${baseKey}:zaps`,
      creatorId,
      'zaps',
      cfg.zaps,
      `Validated creation: ${assetType}`,
      async () => {
        const r = await awardZaps(creatorId, cfg.zaps, { actionType: cfg.zapAction, metadata: meta })
        return r.awarded
      },
    ))
      ? cfg.zaps
      : 0

    // Gem bonus leg → the creator. Separate rule_key so a half-paid validation can finish.
    const gems = (await claimAndPay(
      admin,
      `${baseKey}:gems`,
      creatorId,
      'gems',
      cfg.gems,
      `Validated creation bonus: ${assetType}`,
      async () => {
        const r = await awardGems(creatorId, cfg.gemAction, cfg.gems, meta)
        return r.awarded
      },
    ))
      ? cfg.gems
      : 0

    return { paid: zaps > 0 || gems > 0, zaps, gems }
  } catch (err) {
    console.error('[awardValidatedCreation]', err instanceof Error ? err.message : err)
    return none
  }
}

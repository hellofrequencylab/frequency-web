// Beta referral + Circle-starter contest (phase P3 "Replication"). The tracking,
// scoring, Zaps, leaderboard, and prize-award for the contest that rewards members
// for bringing people in and starting Circles that take root.
//
// WHAT REUSES WHAT (the contest is a thin, flag-gated layer over existing spines):
//   • Attribution   — profiles.referred_by_profile_id (set at signup by
//                      lib/qr/referral.applyReferralAttribution from the fq_ref cookie).
//   • Activation     — the SAME real-first-action signal the existing referral payout
//                      uses (lib/qr/referral ACTIVATION_EVENTS: circle.joined /
//                      practice.adopted / practice.verified in engagement_events). Only
//                      ACTIVATED invites score; dead / self / farmed signups never do.
//   • Zaps           — lib/zaps.awardZapsForAction / awardZaps (the existing ledger path).
//   • Circle members — memberships (status='active') per circle; founder = circles.host_id.
//   • Idempotency    — reward_grants UNIQUE (rule_key, profile_id): the claim-then-pay
//                      lock the referral + Circle-start payouts already use.
//
// GOVERNING RULES:
//   1. Only ACTIVATED invites count. Dedupe per invitee (beta_referrals.invitee UNIQUE).
//   2. The whole contest is INERT behind platform_flags.beta_referral_contest (FALSE by
//      default). Every write path no-ops when the flag is off.
//   3. Prizes are RECORDED at graduation (awardReferralWinners), never granted as paid
//      time before billing is live - that flip belongs to the graduation / billing agent.
//
// The beta_* tables lag the generated Database types (ADR-246), so writes reach
// beta_referrals through the loose service-role handle (lib/beta/db.betaDb); the
// reward_grants / zaps / memberships reads use the normal admin client. Server-only.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardZaps, awardZapsForAction } from '@/lib/zaps'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { betaDb } from './db'

// The activation signals a referral must hit before it scores. Kept in lockstep with
// lib/qr/referral.ACTIVATION_EVENTS (the existing referral-payout gate) so the contest
// and the base referral reward agree on what "activated" means.
const ACTIVATION_EVENTS = ['circle.joined', 'practice.adopted', 'practice.verified']

/** A Circle "takes root" for the contest when it reaches this many ACTIVE members. */
export const CIRCLE_STARTER_THRESHOLD = 10

/** Zaps awarded to the founder when their Circle hits the starter milestone. Reuses
 *  the Zaps ledger (awardZaps) with a contest-specific action label; the per-activated
 *  invite payout reuses the existing 'referral_activated' zap_config action instead. */
export const CIRCLE_STARTER_ZAPS = 150

/** Activated-referral threshold that earns Founding-Member perks at graduation. */
export const FOUNDING_PERK_MIN_REFERRALS = 3

// reward_grants rule_key prefixes (the idempotency keys for each contest payout).
const CIRCLE_START_RULE = 'beta_contest.circle_start:' // + circleId
const WINNER_RULE = 'beta_contest.winner:' // + rank (1|2|3)
const FOUNDING_PERK_RULE = 'beta_contest.founding_perk' // one per profile

/** The prize term (in months of paid membership) for each podium place, granted only
 *  post-Sept-1 at graduation. 1st = 1 year, 2nd = 6 months, 3rd = 3 months. */
export const WINNER_PRIZE_MONTHS: Record<1 | 2 | 3, number> = { 1: 12, 2: 6, 3: 3 }

/** Whether the contest is live. platform_flags.beta_referral_contest, default FALSE so
 *  the whole feature ships inert. Cached per request; fail-closed (FALSE) on any error. */
export const betaReferralContestEnabled = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'beta_referral_contest')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

// ── Tracking: activated referrals ────────────────────────────────────────────────

/** Whether `profileId` has hit at least one activation signal (a real first action). */
async function hasActivated(admin: ReturnType<typeof createAdminClient>, profileId: string): Promise<boolean> {
  const { count } = await admin
    .from('engagement_events')
    .select('id', { count: 'exact', head: true })
    .eq('actor_profile_id', profileId)
    .in('event_type', ACTIVATION_EVENTS)
  return (count ?? 0) > 0
}

/**
 * Record `inviteeProfileId` as an ACTIVATED referral for the contest, and pay the
 * referrer contest Zaps. No-op unless the contest flag is on, the invitee is
 * attributed to a referrer (profiles.referred_by_profile_id), and the invitee has
 * actually activated. Idempotent + deduped: beta_referrals.invitee_profile_id is
 * UNIQUE, so a second call for the same invitee inserts nothing and pays nothing.
 * Best-effort; never throws. Returns true only on a FRESH activated referral.
 *
 * Called opportunistically from lib/qr/referral.releaseReferralReward (right after the
 * base referral reward lands) and from the contest sweep, so it rides the exact same
 * activation moment as the existing payout without a second detection path.
 */
export async function recordReferralActivation(inviteeProfileId: string): Promise<boolean> {
  try {
    if (!(await betaReferralContestEnabled())) return false
    const admin = createAdminClient()

    const { data: me } = await admin
      .from('profiles')
      .select('referred_by_profile_id')
      .eq('id', inviteeProfileId)
      .maybeSingle()
    const referrer = (me as { referred_by_profile_id: string | null } | null)?.referred_by_profile_id
    if (!referrer || referrer === inviteeProfileId) return false

    // Only ACTIVATED invites count.
    if (!(await hasActivated(admin, inviteeProfileId))) return false

    // Which activation signal fired (for the audit trail on the row).
    const { data: evRows } = await admin
      .from('engagement_events')
      .select('event_type')
      .eq('actor_profile_id', inviteeProfileId)
      .in('event_type', ACTIVATION_EVENTS)
      .order('created_at', { ascending: true })
      .limit(1)
    const source = (evRows?.[0] as { event_type?: string } | undefined)?.event_type ?? ''

    // Claim-then-pay: the UNIQUE (invitee) index makes this the exactly-once lock. A
    // duplicate invitee errors here, so no Zaps are paid twice.
    const { error: claimErr } = await betaDb()
      .from('beta_referrals')
      .insert({
        referrer_profile_id: referrer,
        invitee_profile_id: inviteeProfileId,
        activated_at: new Date().toISOString(),
        source,
      })
    if (claimErr) return false // already recorded (or a transient error, retried by the sweep)

    // The claim is the lock; now the contest Zaps must land. Best-effort: a Zaps
    // failure leaves the beta_referrals row (the count still scores); the ledger is
    // the reward, and the sweep does not re-pay because the row already exists.
    await awardZapsForAction(referrer, 'referral_activated').catch(() => ({ awarded: false, amount: 0 }))
    return true
  } catch {
    return false
  }
}

// ── Tracking: Circle-starter milestone ───────────────────────────────────────────

/**
 * Record the Circle-starter milestone for `circleId` if it now has at least
 * CIRCLE_STARTER_THRESHOLD active members, crediting the founder (circles.host_id)
 * with contest Zaps. No-op unless the flag is on and the threshold is met. Idempotent
 * per circle via reward_grants UNIQUE (rule_key, profile_id), so a founder is paid
 * once per Circle no matter how many times this runs. Best-effort; returns true only
 * on a fresh milestone.
 *
 * Called opportunistically when a member joins a Circle (app/(main)/circles.joinCircle)
 * and from the contest sweep, so a Circle that crosses the line scores promptly.
 */
export async function recordCircleStarterMilestone(circleId: string): Promise<boolean> {
  try {
    if (!(await betaReferralContestEnabled())) return false
    const admin = createAdminClient()

    const { data: circle } = await admin
      .from('circles')
      .select('host_id')
      .eq('id', circleId)
      .maybeSingle()
    const founder = (circle as { host_id: string | null } | null)?.host_id
    if (!founder) return false

    // Active members of the Circle (the same signal challenges/health read).
    const { count } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('circle_id', circleId)
      .eq('status', 'active')
    if ((count ?? 0) < CIRCLE_STARTER_THRESHOLD) return false

    // Claim-then-pay: UNIQUE (rule_key, profile_id) makes this once-per-circle.
    const ruleKey = `${CIRCLE_START_RULE}${circleId}`
    const { error: claimErr } = await admin.from('reward_grants').insert({
      rule_key: ruleKey,
      profile_id: founder,
      reward_kind: 'zaps',
      amount: CIRCLE_STARTER_ZAPS,
      detail: 'A Circle you started reached ten active members',
    })
    if (claimErr) return false // already credited for this Circle

    await awardZaps(founder, CIRCLE_STARTER_ZAPS, {
      actionType: 'beta_circle_starter',
      metadata: { circleId },
    }).catch(() => ({ awarded: false, amount: 0 }))

    try {
      await admin.from('notifications').insert({
        recipient_id: founder,
        type: 'achievement',
        reference_type: 'circle',
        reference_id: circleId,
        body: 'A Circle you started reached ten active members. You earned Zaps for the contest.',
      })
    } catch {
      // the notification is best-effort; the milestone already scored
    }
    return true
  } catch {
    return false
  }
}

// ── The sweep (cron-safe) ────────────────────────────────────────────────────────

/**
 * Catch up the contest tally: record any newly-activated referrals and any Circles
 * that have crossed the starter threshold since the last run. Idempotent + bounded, so
 * it is safe to run on a schedule. No-op when the contest flag is off. Returns counts.
 */
export async function runContestSweep(): Promise<{ referralsRecorded: number; circlesRecorded: number }> {
  if (!(await betaReferralContestEnabled())) return { referralsRecorded: 0, circlesRecorded: 0 }
  const admin = createAdminClient()

  // Referrals: attributed members who have activated but are not yet on the board.
  let referralsRecorded = 0
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: events } = await admin
    .from('engagement_events')
    .select('actor_profile_id')
    .in('event_type', ACTIVATION_EVENTS)
    .gte('created_at', since)
    .not('actor_profile_id', 'is', null)
    .limit(3000)
  const actorIds = [...new Set((events ?? []).map((e) => (e as { actor_profile_id: string }).actor_profile_id))]
  if (actorIds.length > 0) {
    const { data: attributed } = await admin
      .from('profiles')
      .select('id')
      .in('id', actorIds)
      .not('referred_by_profile_id', 'is', null)
    for (const r of (attributed ?? []) as { id: string }[]) {
      if (await recordReferralActivation(r.id)) referralsRecorded++
    }
  }

  // Circles: any Circle at or above the threshold that has not scored yet.
  let circlesRecorded = 0
  const { data: circles } = await admin
    .from('circles')
    .select('id')
    .gte('member_count', CIRCLE_STARTER_THRESHOLD)
    .limit(3000)
  for (const c of (circles ?? []) as { id: string }[]) {
    if (await recordCircleStarterMilestone(c.id)) circlesRecorded++
  }

  return { referralsRecorded, circlesRecorded }
}

// ── Leaderboard + member progress ────────────────────────────────────────────────

export interface ContestLeaderboardRow {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  activatedReferrals: number
  circleStarts: number
  /** The contest score = activated referrals + Circle starts (each Circle counts once). */
  score: number
  rank: number
}

/** Count Circle-starter milestones per founder from the reward_grants ledger. */
async function circleStartsByFounder(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Map<string, number>> {
  const by = new Map<string, number>()
  const { data } = await admin
    .from('reward_grants')
    .select('profile_id')
    .like('rule_key', `${CIRCLE_START_RULE}%`)
  for (const g of (data ?? []) as { profile_id: string }[]) {
    by.set(g.profile_id, (by.get(g.profile_id) ?? 0) + 1)
  }
  return by
}

/** Activated referrals per referrer, from beta_referrals. */
async function activatedReferralsByReferrer(): Promise<Map<string, number>> {
  const by = new Map<string, number>()
  const { data } = await betaDb().from('beta_referrals').select('referrer_profile_id')
  for (const r of (data ?? []) as { referrer_profile_id: string }[]) {
    by.set(r.referrer_profile_id, (by.get(r.referrer_profile_id) ?? 0) + 1)
  }
  return by
}

/** Rank contest entrants by score (activated referrals + Circle starts), then by
 *  activated referrals, then handle for a stable order. Pure. */
export function rankContestRows(
  rows: Omit<ContestLeaderboardRow, 'rank'>[],
): ContestLeaderboardRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.activatedReferrals - a.activatedReferrals ||
        a.handle.localeCompare(b.handle),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

/** The contest leaderboard: everyone with at least one activated referral or Circle
 *  start, ranked. Empty (and safe) when the flag is off. */
export async function getContestLeaderboard(limit = 25): Promise<ContestLeaderboardRow[]> {
  try {
    if (!(await betaReferralContestEnabled())) return []
    const admin = createAdminClient()
    const [referralsBy, circlesBy] = await Promise.all([
      activatedReferralsByReferrer(),
      circleStartsByFounder(admin),
    ])

    const ids = new Set<string>([...referralsBy.keys(), ...circlesBy.keys()])
    if (ids.size === 0) return []

    const { data: people } = await admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .in('id', [...ids])
      .eq('is_active', true)
      .eq('is_system', false)
    const named = new Map(
      ((people ?? []) as { id: string; display_name: string; handle: string; avatar_url: string | null }[]).map(
        (p) => [p.id, p],
      ),
    )

    const rows: Omit<ContestLeaderboardRow, 'rank'>[] = [...ids]
      .filter((id) => named.has(id))
      .map((id) => {
        const activatedReferrals = referralsBy.get(id) ?? 0
        const circleStarts = circlesBy.get(id) ?? 0
        const p = named.get(id)!
        return {
          profileId: id,
          displayName: p.display_name ?? 'Member',
          handle: p.handle ?? '',
          avatarUrl: p.avatar_url,
          activatedReferrals,
          circleStarts,
          score: activatedReferrals + circleStarts,
        }
      })
      .filter((r) => r.score > 0)

    return rankContestRows(rows).slice(0, limit)
  } catch {
    return []
  }
}

export interface MemberContestProgress {
  enabled: boolean
  activatedReferrals: number
  /** Attributed signups who have NOT activated yet (invited, not scored). */
  pendingReferrals: number
  circleStarts: number
  score: number
  /** 1-based rank on the leaderboard, or null if not on the board. */
  rank: number | null
  /** How many more activated referrals to earn Founding-Member perks (0 once earned). */
  toFoundingPerk: number
  foundingPerkEarned: boolean
}

const EMPTY_PROGRESS: MemberContestProgress = {
  enabled: false,
  activatedReferrals: 0,
  pendingReferrals: 0,
  circleStarts: 0,
  score: 0,
  rank: null,
  toFoundingPerk: FOUNDING_PERK_MIN_REFERRALS,
  foundingPerkEarned: false,
}

/** One member's own contest standing, for the referral hub. Fail-safe to an empty,
 *  disabled shape (so the hub renders a coming-soon state, never an error). */
export async function getMemberContestProgress(profileId: string): Promise<MemberContestProgress> {
  try {
    if (!(await betaReferralContestEnabled())) return EMPTY_PROGRESS
    const admin = createAdminClient()

    const [{ data: activatedRows }, { count: attributedTotal }, { data: circleGrants }, board] = await Promise.all([
      betaDb().from('beta_referrals').select('id').eq('referrer_profile_id', profileId),
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('referred_by_profile_id', profileId),
      admin
        .from('reward_grants')
        .select('rule_key')
        .eq('profile_id', profileId)
        .like('rule_key', `${CIRCLE_START_RULE}%`),
      getContestLeaderboard(1000),
    ])

    const activatedReferrals = (activatedRows ?? []).length
    const circleStarts = (circleGrants ?? []).length
    const pendingReferrals = Math.max(0, (attributedTotal ?? 0) - activatedReferrals)
    const score = activatedReferrals + circleStarts
    const mine = board.find((r) => r.profileId === profileId)
    const foundingPerkEarned = activatedReferrals >= FOUNDING_PERK_MIN_REFERRALS

    return {
      enabled: true,
      activatedReferrals,
      pendingReferrals,
      circleStarts,
      score,
      rank: mine?.rank ?? null,
      toFoundingPerk: Math.max(0, FOUNDING_PERK_MIN_REFERRALS - activatedReferrals),
      foundingPerkEarned,
    }
  } catch {
    return EMPTY_PROGRESS
  }
}

// ── Prizes (RECORDED at graduation, never granted as paid time before billing) ────

export interface WinnerAward {
  rank: 1 | 2 | 3
  profileId: string
  displayName: string
  handle: string
  prizeMonths: number
  score: number
  /** false when this winner was already recorded on a prior run (idempotent). */
  fresh: boolean
}

export interface AwardWinnersSummary {
  /** false = the contest flag is off; nothing was awarded. */
  enabled: boolean
  winners: WinnerAward[]
  /** Profiles that earned Founding-Member perks (3+ activated referrals). */
  foundingPerkProfileIds: string[]
  foundingPerkFresh: number
  /** true when nothing was written (an idempotent re-run, or an empty board). */
  alreadyAwarded: boolean
}

/**
 * Grant the contest prizes. Called by the beta-access agent's graduateBeta() at
 * graduation (P4), NOT before: this RECORDS each winner's entitlement on the
 * reward_grants ledger (idempotent via UNIQUE rule_key + profile_id) so the billing
 * agent can apply the free paid time once billing is live. It does NOT flip billing,
 * paid tier, or founding status itself (those belong to other agents).
 *
 *   1st place  -> 12 months free paid membership (recorded)
 *   2nd place  -> 6 months
 *   3rd place  -> 3 months
 *   3+ activated referrals -> Founding-Member perks (recorded)
 *
 * Idempotent: re-running grants nothing new (the reward_grants UNIQUE index dedupes),
 * so graduateBeta can call it safely more than once. Returns a summary of what was
 * (and was already) awarded. `dryRun` computes the summary without writing.
 */
export async function awardReferralWinners(
  opts: { dryRun?: boolean } = {},
): Promise<ActionResult<AwardWinnersSummary>> {
  try {
    if (!(await betaReferralContestEnabled())) {
      return ok({
        enabled: false,
        winners: [],
        foundingPerkProfileIds: [],
        foundingPerkFresh: 0,
        alreadyAwarded: true,
      })
    }
    const admin = createAdminClient()
    const board = await getContestLeaderboard(1000)

    // Podium: the top 3 by score.
    const podium = board.slice(0, 3)
    const winners: WinnerAward[] = []
    for (let i = 0; i < podium.length; i++) {
      const rank = (i + 1) as 1 | 2 | 3
      const row = podium[i]
      const prizeMonths = WINNER_PRIZE_MONTHS[rank]
      let fresh = false
      if (!opts.dryRun) {
        const { error } = await admin.from('reward_grants').insert({
          rule_key: `${WINNER_RULE}${rank}`,
          profile_id: row.profileId,
          reward_kind: 'membership',
          amount: prizeMonths,
          detail: `Referral contest winner (place ${rank}): ${prizeMonths} months free paid membership, applied when billing is live`,
        })
        fresh = !error
      }
      winners.push({
        rank,
        profileId: row.profileId,
        displayName: row.displayName,
        handle: row.handle,
        prizeMonths,
        score: row.score,
        fresh,
      })
    }

    // Founding-Member perks for everyone with 3+ activated referrals.
    const eligible = board.filter((r) => r.activatedReferrals >= FOUNDING_PERK_MIN_REFERRALS)
    const foundingPerkProfileIds = eligible.map((r) => r.profileId)
    let foundingPerkFresh = 0
    if (!opts.dryRun) {
      for (const r of eligible) {
        const { error } = await admin.from('reward_grants').insert({
          rule_key: FOUNDING_PERK_RULE,
          profile_id: r.profileId,
          reward_kind: 'founding_perk',
          amount: 0,
          detail: `Founding-Member perks earned: brought in ${r.activatedReferrals} activated members`,
        })
        if (!error) foundingPerkFresh++
      }
    }

    const alreadyAwarded =
      !opts.dryRun && winners.every((w) => !w.fresh) && foundingPerkFresh === 0

    return ok({
      enabled: true,
      winners,
      foundingPerkProfileIds,
      foundingPerkFresh,
      alreadyAwarded,
    })
  } catch (err) {
    console.error('[referral-contest] awardReferralWinners failed:', err)
    return fail('Could not award the referral contest winners.')
  }
}

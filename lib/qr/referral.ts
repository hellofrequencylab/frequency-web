// Referral attribution. A scanned referral code drops an `fq_ref` cookie (the
// referrer's profile id) via the /q resolver; this applies it once, when the new
// member finishes onboarding. One-time: a member's referred_by is set only if empty.
// Server-only.

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { awardZapsForAction } from '@/lib/zaps'
import { track } from '@/lib/analytics/track'
import { recordEntryPointConversion } from '@/lib/entry-points/ab'
import { parseVcard } from '@/lib/vcard'

const REF_COOKIE = 'fq_ref'
const VAR_COOKIE = 'fq_var'

/** Attribute an A/B entry-point conversion (ADR-135) from the fq_var cookie set by the
 *  /q resolver (`<codeId>:<variantKey>`). Best-effort; always clears the cookie. */
export async function applyEntryPointConversion(newProfileId: string): Promise<void> {
  const jar = await cookies()
  const raw = jar.get(VAR_COOKIE)?.value
  if (!raw) return
  try {
    const sep = raw.indexOf(':')
    const codeId = sep > 0 ? raw.slice(0, sep) : ''
    const variantKey = sep > 0 ? raw.slice(sep + 1) : ''
    if (codeId && variantKey) await recordEntryPointConversion(codeId, variantKey, newProfileId)
  } catch {
    // attribution is a bonus, never a blocker on signup
  } finally {
    jar.delete(VAR_COOKIE)
  }
}

/** Attribute `newProfileId` to the referrer in the fq_ref cookie (if any) and
 *  reward the referrer once. Best-effort: never throws, always clears the cookie. */
export async function applyReferralAttribution(newProfileId: string): Promise<void> {
  const jar = await cookies()
  const ref = jar.get(REF_COOKIE)?.value
  if (!ref || ref === newProfileId) {
    if (ref) jar.delete(REF_COOKIE)
    return
  }

  try {
    const db = createAdminClient()

    const { data: me } = await db
      .from('profiles')
      .select('referred_by_profile_id')
      .eq('id', newProfileId)
      .maybeSingle()
    if (!me || me.referred_by_profile_id) return // already attributed (or gone)

    const { data: referrer } = await db.from('profiles').select('id').eq('id', ref).maybeSingle()
    if (!referrer) return

    await db.from('profiles').update({ referred_by_profile_id: ref }).eq('id', newProfileId)

    // Record the attribution once. The REFERRER is NOT paid here: research is clear
    // that paying on signup invites self-referral / farming and rewards low-quality
    // signups. Instead releaseReferralReward() credits the referrer (invite_accepted)
    // once this member ACTIVATES (joins a circle / adopts or logs a practice) — the
    // top anti-fraud move that also preferentially rewards the high-LTV cohort. The
    // newcomer's own join + referred bonus still land at signup (grantJoinZaps).
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `referral:${ref}:${newProfileId}`,
      source: 'system',
      eventType: 'referral.completed',
      actorProfileId: ref,
      context: { referred: newProfileId },
    })
    if (recorded) void track('qr.referral_signup', { referrer: ref }, newProfileId)
  } catch {
    // swallow — attribution is a bonus, never a blocker on signup
  } finally {
    jar.delete(REF_COOKIE)
  }
}

// Activation milestones (mirrors lib/analytics/dashboard ACTIVATION_FUNNEL) — the
// referred member must hit ONE before the referrer is paid. These are real-human
// signals, so fake/self signups that never engage never trigger a payout.
const ACTIVATION_EVENTS = ['circle.joined', 'practice.adopted', 'practice.verified']

// Anti-farming rate cap: a referrer is paid at most this many referral rewards per
// rolling 24h. It is a RATE LIMIT, not a loss — over the cap, the payout is skipped
// this run and retried later (the cron reprocesses activated-but-unpaid referrals),
// so a held reward lands once older payouts age out of the window. A real human in a
// local beta never hits it; an automated farm does. Layered on the activation gate.
const REFERRAL_DAILY_CAP = 25

/** scan2 L6-11 (2026-09-05): a `referral.activated:*` claim still carrying `amount = 0` after this many
 *  minutes is a run that died between the claim insert and the Zap award (the award stamps the paid
 *  amount onto the claim as its last step). The next run re-pays it instead of reading it as "already
 *  paid" forever. Far above one run's duration; only a crash gets a claim to this age. */
export const REFERRAL_CLAIM_STALE_MINUTES = 10

/** The rule_key of the referrer's payout claim for one referred member (the exactly-once lock). PURE. */
export function referralRuleKey(referredProfileId: string): string {
  return `referral.activated:${referredProfileId}`
}

/** scan2 L6-11: decide whether an existing claim row is SETTLED (paid, or a fresh in-flight claim
 *  another run holds) or STALE (a zero-amount claim older than the stale window: the claimant died
 *  before paying, so it is re-payable). PURE, so the cron's scan and the release share one rule. */
export function referralClaimState(
  claim: { amount: number | null; granted_at: string | null },
  nowMs = Date.now(),
): 'paid' | 'in_flight' | 'stale' {
  if ((claim.amount ?? 0) > 0) return 'paid'
  const at = claim.granted_at ? Date.parse(claim.granted_at) : NaN
  if (!Number.isFinite(at)) return 'stale'
  return nowMs - at >= REFERRAL_CLAIM_STALE_MINUTES * 60_000 ? 'stale' : 'in_flight'
}

/** Pay the referrer for `referredProfileId` IFF that member has activated and the
 *  reward hasn't been granted yet. Idempotent (reward_grants is UNIQUE on rule_key +
 *  profile_id, so the payout is exactly-once per pair). Returns true only on a fresh
 *  payout. Best-effort; never throws.
 *
 *  2026-09-05 correction (scan2 L6-11): "exactly-once" above used to be "at-most-once". The claim row
 *  was inserted with amount 0 and never updated, and a duplicate-key error on a later run was read as
 *  "already paid" — so a crash between the claim insert and awardZapsForAction left the referrer
 *  claimed-but-unpaid for good. The award now STAMPS the paid amount onto the claim as its final step,
 *  and a duplicate claim is re-examined: paid (amount > 0) or fresh (another run mid-flight) → skip;
 *  zero-amount and older than REFERRAL_CLAIM_STALE_MINUTES → the claimant died, re-take it and pay.
 *  Before re-paying, the Zap ledger is checked for an `invite_accepted` row written just after the
 *  stale claim (the award landed but the stamp did not): that case is stamped, not paid twice. */
export async function releaseReferralReward(referredProfileId: string): Promise<boolean> {
  try {
    const db = createAdminClient()
    const { data: me } = await db
      .from('profiles')
      .select('referred_by_profile_id')
      .eq('id', referredProfileId)
      .maybeSingle()
    const ref = (me as { referred_by_profile_id: string | null } | null)?.referred_by_profile_id
    if (!ref) return false

    // Activated? (at least one qualifying engagement event)
    const { count } = await db
      .from('engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_profile_id', referredProfileId)
      .in('event_type', ACTIVATION_EVENTS)
    if (!count) return false

    // Beta referral + Circle-starter contest (phase P3): record this activated
    // Rate cap (anti-farming): skip if the referrer has already hit the 24h payout
    // cap. No grant is written, so it retries on a later run once payouts age out.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: recentPaid } = await db
      .from('reward_grants')
      .select('rule_key', { count: 'exact', head: true })
      .eq('profile_id', ref)
      .like('rule_key', 'referral.activated:%')
      .gte('granted_at', since)
    if ((recentPaid ?? 0) >= REFERRAL_DAILY_CAP) return false

    // Claim-then-pay: the UNIQUE (rule_key, profile_id) index makes this payout
    // exactly-once for the (referrer, referred) pair.
    const ruleKey = referralRuleKey(referredProfileId)
    const claimedAtIso = new Date().toISOString()
    const { error: claimErr } = await db.from('reward_grants').insert({
      rule_key: ruleKey,
      profile_id: ref,
      reward_kind: 'zaps',
      amount: 0,
      detail: 'Someone you invited got started',
      granted_at: claimedAtIso,
    })
    if (claimErr) {
      // 2026-09-05 (scan2 L6-11 / R3): this line used to be `return false // already paid (or a
      // transient error — retried next run)`. Only a duplicate key (23505) means "already claimed";
      // anything else is a failed write that must be visible, not read as a payout.
      if (claimErr.code !== '23505') {
        console.error('[referral] reward_grants claim failed (nothing paid; retried next run):', claimErr.message)
        return false
      }
      const { data: existing } = await db
        .from('reward_grants')
        .select('amount, granted_at')
        .eq('rule_key', ruleKey)
        .eq('profile_id', ref)
        .maybeSingle()
      const prior = existing as { amount: number | null; granted_at: string | null } | null
      if (!prior || referralClaimState(prior) !== 'stale') return false // paid, or another run is mid-flight
      // Did the dead run's award land before it died? An invite_accepted ledger row for this referrer
      // written in the two minutes after the stale claim is that award (the claim always precedes it).
      const priorAtMs = Date.parse(prior.granted_at ?? '') || 0
      const { count: landed } = await db
        .from('zap_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', ref)
        .eq('action_type', 'invite_accepted')
        .gte('created_at', new Date(priorAtMs).toISOString())
        .lt('created_at', new Date(priorAtMs + 2 * 60_000).toISOString())
      if (landed) {
        // Paid but never stamped: settle the claim (amount > 0 = paid) and do NOT pay again.
        await db.from('reward_grants').update({ amount: 1 }).eq('rule_key', ruleKey).eq('profile_id', ref).eq('amount', 0)
        console.warn(`[referral] stale claim ${ruleKey} for ${ref} had a landed award; stamped, not re-paid`)
        return false
      }
      // Re-take the stale claim: a conditional UPDATE so two runs cannot both re-pay it.
      const { data: retaken } = await db
        .from('reward_grants')
        .update({ granted_at: claimedAtIso })
        .eq('rule_key', ruleKey)
        .eq('profile_id', ref)
        .eq('amount', 0)
        .lt('granted_at', new Date(Date.now() - REFERRAL_CLAIM_STALE_MINUTES * 60_000).toISOString())
        .select('rule_key')
      if (!retaken || retaken.length === 0) return false // another run re-took it first
      console.warn(`[referral] re-paying stale claimed-but-unpaid referral ${ruleKey} for ${ref} (claimed ${prior.granted_at})`)
    }

    // The claim is the lock, but the Zaps must actually land. If awardZapsForAction fails
    // (awarded:false) or throws, release the claim so the cron re-pays on a later run instead of
    // leaving the referrer claimed-but-unpaid (mirrors the reward claim-then-pay pattern).
    const zapRes = await awardZapsForAction(ref, 'invite_accepted').catch(() => ({ awarded: false, amount: 0 }))
    if (!zapRes.awarded) {
      await db.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', ref)
      return false
    }
    // Stamp the paid amount: the durable "this claim is paid" marker (scan2 L6-11). A crash before this
    // line leaves amount 0, which a later run re-examines (see above) rather than trusting forever.
    await db
      .from('reward_grants')
      .update({ amount: Math.max(1, zapRes.amount) })
      .eq('rule_key', ruleKey)
      .eq('profile_id', ref)
    await recordEngagementEvent({
      idempotencyKey: `referral_reward:${ref}:${referredProfileId}`,
      source: 'system',
      eventType: 'referral.activated',
      actorProfileId: ref,
      context: { referred: referredProfileId },
    }).catch(() => {})
    void track('qr.referral_activated', { referrer: ref }, referredProfileId)
    try {
      await db.from('notifications').insert({
        recipient_id: ref,
        actor_id: referredProfileId,
        type: 'referral',
        reference_type: 'profile',
        reference_id: referredProfileId,
        body: 'Someone you invited just got started. You earned Zaps ⚡',
      })
    } catch {
      // the notification is best-effort; the payout already landed
    }
    return true
  } catch {
    return false
  }
}

/** Cron runner: release referral rewards for recently-activated referred members.
 *  Idempotent + bounded (last 30 days, capped), so it is safe to run on a schedule —
 *  re-processing an already-paid pair is a no-op.
 *
 *  2026-09-05 correction (scan2 R4): "a no-op" used to mean "a duplicate-key 409 on every run, forever"
 *  — the scan never excluded pairs already holding a `referral.activated:*` grant, so one paid pair
 *  produced 49 duplicate-key errors a day in the logs, one per run, hiding real errors. The scan now
 *  looks the candidates' claims up in one query and skips every SETTLED pair (paid, or a fresh claim
 *  another run holds); only unclaimed pairs and stale zero-amount claims (L6-11) reach the release.
 *  `settled` reports how many were skipped that way. */
export async function runReferralRelease(): Promise<{ released: number; checked: number; settled: number }> {
  const db = createAdminClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: events } = await db
    .from('engagement_events')
    .select('actor_profile_id')
    .in('event_type', ACTIVATION_EVENTS)
    .gte('created_at', since)
    .not('actor_profile_id', 'is', null)
    .limit(3000)
  const actorIds = [...new Set((events ?? []).map((e) => (e as { actor_profile_id: string }).actor_profile_id))]
  if (actorIds.length === 0) return { released: 0, checked: 0, settled: 0 }
  const { data: referred } = await db
    .from('profiles')
    .select('id')
    .in('id', actorIds)
    .not('referred_by_profile_id', 'is', null)
  const candidates = (referred ?? []) as { id: string }[]
  if (candidates.length === 0) return { released: 0, checked: 0, settled: 0 }

  // R4: one lookup of the candidates' existing claims; settled pairs never reach the insert.
  const settledKeys = new Set<string>()
  const { data: claims } = await db
    .from('reward_grants')
    .select('rule_key, amount, granted_at')
    .in(
      'rule_key',
      candidates.map((r) => referralRuleKey(r.id)),
    )
  for (const c of (claims ?? []) as { rule_key: string; amount: number | null; granted_at: string | null }[]) {
    if (referralClaimState(c) !== 'stale') settledKeys.add(c.rule_key)
  }

  let released = 0
  let checked = 0
  for (const r of candidates) {
    if (settledKeys.has(referralRuleKey(r.id))) continue
    checked++
    if (await releaseReferralReward(r.id)) released++
  }
  return { released, checked, settled: settledKeys.size }
}

/** The referrer behind the current visitor's `fq_ref` cookie, for the personalized
 *  splash ("[Name] invited you"). Read-only — does NOT clear the cookie (that happens
 *  at signup in applyReferralAttribution). Null when there's no valid live referral.
 *  `vcardEnabled` reports whether this referrer has published a contact card, so a
 *  scanned personal code (which lands on the splash for an anonymous scanner) can offer
 *  a "Save contact" path to `/people/<handle>/vcard` — otherwise a scan never reaches it. */
export async function getReferrer(): Promise<{
  displayName: string
  handle: string
  avatarUrl: string | null
  vcardEnabled: boolean
} | null> {
  try {
    const jar = await cookies()
    const ref = jar.get(REF_COOKIE)?.value
    if (!ref) return null
    const db = createAdminClient()
    const { data } = await db
      .from('profiles')
      .select('display_name, handle, avatar_url, is_active, is_system, vcard')
      .eq('id', ref)
      .maybeSingle()
    const p = data as
      | {
          display_name: string
          handle: string
          avatar_url: string | null
          is_active: boolean
          is_system: boolean
          vcard: unknown
        }
      | null
    if (!p || p.is_active === false || p.is_system) return null
    return {
      displayName: p.display_name,
      handle: p.handle,
      avatarUrl: p.avatar_url,
      vcardEnabled: parseVcard(p.vcard).enabled,
    }
  } catch {
    return null
  }
}

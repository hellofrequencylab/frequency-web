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

/** Pay the referrer for `referredProfileId` IFF that member has activated and the
 *  reward hasn't been granted yet. Idempotent (reward_grants is UNIQUE on rule_key +
 *  profile_id, so the payout is exactly-once per pair). Returns true only on a fresh
 *  payout. Best-effort; never throws. */
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
    const ruleKey = `referral.activated:${referredProfileId}`
    const { error: claimErr } = await db.from('reward_grants').insert({
      rule_key: ruleKey,
      profile_id: ref,
      reward_kind: 'zaps',
      amount: 0,
      detail: 'Someone you invited got started',
    })
    if (claimErr) return false // already paid (or a transient error — retried next run)

    // The claim is the lock, but the Zaps must actually land. If awardZapsForAction fails
    // (awarded:false) or throws, release the claim so the cron re-pays on a later run instead of
    // leaving the referrer claimed-but-unpaid (mirrors the reward claim-then-pay pattern).
    const zapRes = await awardZapsForAction(ref, 'invite_accepted').catch(() => ({ awarded: false, amount: 0 }))
    if (!zapRes.awarded) {
      await db.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', ref)
      return false
    }
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
 *  re-processing an already-paid pair is a no-op. */
export async function runReferralRelease(): Promise<{ released: number; checked: number }> {
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
  if (actorIds.length === 0) return { released: 0, checked: 0 }
  const { data: referred } = await db
    .from('profiles')
    .select('id')
    .in('id', actorIds)
    .not('referred_by_profile_id', 'is', null)
  let released = 0
  for (const r of (referred ?? []) as { id: string }[]) {
    if (await releaseReferralReward(r.id)) released++
  }
  return { released, checked: (referred ?? []).length }
}

/** The referrer behind the current visitor's `fq_ref` cookie, for the personalized
 *  splash ("[Name] invited you"). Read-only — does NOT clear the cookie (that happens
 *  at signup in applyReferralAttribution). Null when there's no valid live referral. */
export async function getReferrer(): Promise<{ displayName: string; handle: string; avatarUrl: string | null } | null> {
  try {
    const jar = await cookies()
    const ref = jar.get(REF_COOKIE)?.value
    if (!ref) return null
    const db = createAdminClient()
    const { data } = await db
      .from('profiles')
      .select('display_name, handle, avatar_url, is_active, is_system')
      .eq('id', ref)
      .maybeSingle()
    const p = data as
      | { display_name: string; handle: string; avatar_url: string | null; is_active: boolean; is_system: boolean }
      | null
    if (!p || p.is_active === false || p.is_system) return null
    return { displayName: p.display_name, handle: p.handle, avatarUrl: p.avatar_url }
  } catch {
    return null
  }
}

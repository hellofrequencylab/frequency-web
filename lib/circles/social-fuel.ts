// Social fuel — the gamification-as-fuel layer (Resonance Engine Phase 5 · ADR-386 ·
// docs/NEXT-GEN-CRM.md "Gamification + practice as fuel" / "Social streaks as the moat").
//
// Four moves, all serving ACTIVATION (get into a room), never dwell:
//   1. celebrateInCircleFeed  — fire a Journey / Master-rank celebration into the CIRCLE FEED
//      (Peloton-style peer recognition, drafted via withVoice), NOT a private modal. The crowd-in
//      channel: a shoutout the member's Circle sees, so recognition is social.
//   2. circleStreakWeeks      — a cooperative, LOCAL-ONLY Circle streak: consecutive weeks the
//      Circle kept at least a quorum of members active together. Social streaks beat solo ones.
//   3. circleMatesToNudge     — who in a Circle is about to break their own streak, so a one-tap
//      "nudge a Circle-mate" can re-light both people (the nudger and the nudged).
//   4. structuralRiskFromCircleTies — a member with ZERO Circle ties is the highest STRUCTURAL
//      risk: a signal the Today ranker can fold in, routing them to matchmaking not content.
//
// Two halves, the testability law (mirroring lib/ai/vera/today.ts + lib/traits/compute.ts):
//   • PURE helpers (the streak math, the nudge selection, the risk signal) — no IO, unit-tested.
//   • IO (celebrate / nudge) — service-role, fail-SAFE: a missed celebration / nudge must never
//     break the act it marks. Drafting is best-effort with a deterministic in-voice fallback.
//
// Guardrail (the brand-fatal-otherwise rule): every mechanic serves getting into a room. Vera
// NEVER writes "earn N Zaps"; the celebration names the achievement + the next room, plainly.
//
// authz-delegated: celebrate/nudge are system/owner-scoped helpers (like lib/system-line.ts).
// The celebration posts as the SYSTEM account into the member's own Circles; the nudge action's
// caller (a member nudging their own Circle-mate) is authorized at the call site (the server
// action resolves the nudger from the session + checks shared-Circle membership).

import { createAdminClient } from '@/lib/supabase/admin'
import { withVoice } from '@/lib/ai/voice'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'

// ── Pure: the cooperative Circle streak (local-only) ─────────────────────────────

/** Per-week activity for ONE Circle: how many of its members were active that week, and the
 *  Circle's active-member size that week (the quorum denominator). Ordered most-recent week first
 *  by the caller; index 0 is the current week. PURE input. */
export interface CircleWeekActivity {
  /** Distinct members of the Circle who were active (logged a practice) that week. */
  activeMembers: number
  /** The Circle's active membership that week (the denominator for the quorum). */
  circleSize: number
}

/** A Circle keeps its cooperative streak in a week when at least this FRACTION of its members
 *  were active together. Cooperative, not "everyone or bust": a Circle stays lit when most of
 *  it shows up. */
export const CIRCLE_QUORUM_FRACTION = 0.5
/** A Circle needs at least this many members before a cooperative streak is meaningful (two is
 *  the floor for "together"). Below it, the streak is 0 (a solo member is not a Circle streak). */
export const CIRCLE_MIN_SIZE = 2

/** Did a Circle meet its cooperative quorum in a given week? PURE. True when the Circle is big
 *  enough AND at least CIRCLE_QUORUM_FRACTION of it was active together. */
export function circleWeekMetQuorum(week: CircleWeekActivity): boolean {
  const size = Math.max(0, Math.floor(week.circleSize || 0))
  const active = Math.max(0, Math.floor(week.activeMembers || 0))
  if (size < CIRCLE_MIN_SIZE) return false
  return active >= Math.ceil(size * CIRCLE_QUORUM_FRACTION)
}

/**
 * The cooperative Circle streak: consecutive weeks (ending this week) the Circle met its quorum.
 * PURE + deterministic. `weeks` is ordered most-recent first (index 0 = current week). The streak
 * walks forward from the current week while each week met quorum; a single miss ends it (no freeze
 * here — this is a LOCAL, cooperative streak, deliberately simpler than the solo daily one). It is
 * "local-only": it lives in the Circle, not a global leaderboard, so it never becomes a vanity race.
 */
export function circleStreakWeeks(weeks: CircleWeekActivity[]): number {
  let count = 0
  for (const w of weeks) {
    if (circleWeekMetQuorum(w)) count++
    else break
  }
  return count
}

// ── Pure: who to nudge (about to break their own streak) ─────────────────────────

/** One Circle-mate's daily-streak state, the minimum the nudge selector needs. PURE input. */
export interface CircleMateStreak {
  profileId: string
  /** Their current daily practice streak length (0 = none). */
  current: number
  /** Their run is alive but today is not logged yet (one slip from breaking). */
  atRisk: boolean
}

/**
 * The Circle-mates worth a one-tap nudge: those whose streak is ALIVE, AT RISK today, and worth
 * saving (a real run, not a day-one). PURE. Ordered longest-streak first, so the nudge protects
 * the most momentum. Excludes the nudger themselves. A nudge re-lights both people, so we surface
 * the few who most need it, capped, never the whole Circle (no spam).
 */
export function circleMatesToNudge(
  mates: CircleMateStreak[],
  nudgerProfileId: string,
  cap = 3,
): CircleMateStreak[] {
  return mates
    .filter((m) => m.profileId !== nudgerProfileId && m.atRisk && m.current >= 2)
    .sort((a, b) => (b.current !== a.current ? b.current - a.current : a.profileId < b.profileId ? -1 : 1))
    .slice(0, Math.max(0, cap))
}

// ── Pure: zero-Circle-ties as highest structural risk ────────────────────────────

/** The structural-risk band a member's Circle ties put them in. A member with NO Circle is the
 *  highest STRUCTURAL risk (no social anchor); one tie is a foothold; two or more is anchored. */
export type StructuralRisk = 'unanchored' | 'thin' | 'anchored'

/**
 * Band a member by their number of active Circle ties. PURE. Zero ties = `unanchored`, the highest
 * structural risk (docs/NEXT-GEN-CRM.md: "Members with zero Circle ties are flagged highest
 * structural risk and routed to matchmaking, not content nudges"). The Today ranker can read this
 * to up-weight an unanchored member toward a connection move over another content nudge.
 */
export function structuralRiskFromCircleTies(circleTies: number): StructuralRisk {
  const ties = Math.max(0, Math.floor(circleTies || 0))
  if (ties === 0) return 'unanchored'
  if (ties === 1) return 'thin'
  return 'anchored'
}

/** A small additive boost (0..1) the Today ranker can fold in for structurally-risky members, so
 *  an unanchored member rises toward a connection move. PURE. Unanchored lifts most; anchored, none.
 *  Kept modest so it tilts, not dominates, the existing churn x propensity x action score. */
export function structuralRiskBoost(risk: StructuralRisk): number {
  switch (risk) {
    case 'unanchored':
      return 1
    case 'thin':
      return 0.4
    default:
      return 0
  }
}

// ── IO: the Circle-feed celebration (peer recognition, Vera-drafted) ─────────────

/** What was achieved, for the celebration draft. Plain, in-voice; proper nouns carry the magic. */
export interface CelebrationContext {
  /** The member's handle (the @mention the Circle sees), without the leading @. */
  handle: string
  /** The kind of milestone: a finished Journey, or reaching Master rank. */
  kind: 'journey_finished' | 'master_rank'
  /** A specific name where it helps (the Journey's name), optional. */
  detail?: string | null
}

/** A deterministic, in-voice celebration line (the fallback when AI is off / over budget). Names
 *  the achievement + a light next step into a room. No "earn N Zaps", no narrated feelings, no
 *  dashes. Proper nouns capitalized per the canon. */
export function deterministicCelebration(ctx: CelebrationContext): string {
  const who = `@${ctx.handle}`
  if (ctx.kind === 'master_rank') {
    return `${who} reached Master this season. Worth a hello at the next Circle.`
  }
  const journey = ctx.detail ? `the ${ctx.detail} Journey` : 'a Journey'
  return `${who} just finished ${journey}. Good one to ask them about next time you meet.`
}

const CELEBRATION_SYSTEM = withVoice(
  `You write ONE short peer-recognition line for a community Circle feed, celebrating a member's milestone. You get the member's @handle and what they achieved. Write a single plain line, warm and dry, that NAMES the achievement and gently points to a next get-together. Rules: keep the @handle, capitalize proper nouns (Journey, Master, Circle) exactly, never say "earn" or any number of Zaps or Gems, never narrate anyone's feelings, no preamble, no dashes. Return ONLY the one line.`,
)

/** Draft the celebration line. Best-effort AI, deterministic in-voice fallback. Never throws. */
async function draftCelebration(ctx: CelebrationContext): Promise<string> {
  const fallback = deterministicCelebration(ctx)
  try {
    if (!(await aiAvailable()) || (await featureOverBudget('social_fuel'))) return fallback
    const signal = JSON.stringify({ handle: ctx.handle, kind: ctx.kind, detail: ctx.detail ?? null })
    const res = await completeText({
      system: CELEBRATION_SYSTEM,
      messages: [{ role: 'user', content: signal }],
      tier: 'haiku',
      maxTokens: 80,
      cacheSystem: true,
    })
    await recordAiUsage({ feature: 'social_fuel', model: res.tier, usage: res.usage, costUsd: res.costUsd })
    const line = (res.text ?? '').split('\n').map((l) => l.trim()).find(Boolean)
    // Keep the draft only if it preserved the @mention (so the Circle actually sees them).
    if (line && new RegExp(`@${ctx.handle}\\b`, 'i').test(line)) return line
    return fallback
  } catch (e) {
    if (e instanceof AiUnavailableError) return fallback
    return fallback
  }
}

/**
 * Fire a member's milestone celebration into their CIRCLE feeds (peer recognition, crowd-in),
 * authored by the system account, drafted via withVoice. Posts one circle-scoped (`group`) post
 * per Circle the member actively belongs to, so the people who'd cheer them actually see it. A
 * member in no Circle gets no post (nothing private; the recognition is social by design).
 *
 * FAIL-SAFE + best-effort: any error is swallowed (a missed celebration must never block the
 * milestone). Service-role; the milestone hook authorized the event. Returns how many Circle
 * feeds were posted to (0 when the member is unanchored or anything failed).
 */
export async function celebrateInCircleFeed(profileId: string, ctx: CelebrationContext): Promise<number> {
  try {
    const admin = createAdminClient()

    // The system author (the one shared door for automated posts, like postSystemLine).
    const { data: system } = await admin
      .from('profiles')
      .select('id')
      .eq('is_system', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!system) return 0

    // The member's active Circles (the rooms that should see the shoutout).
    const { data: memberships } = await admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    const circleIds = [
      ...new Set(((memberships ?? []) as { circle_id: string | null }[]).map((m) => m.circle_id).filter(Boolean) as string[]),
    ]
    if (circleIds.length === 0) return 0 // unanchored: no Circle to celebrate in

    const body = await draftCelebration(ctx)

    let posted = 0
    for (const circleId of circleIds) {
      const { error } = await admin.from('posts').insert({
        author_id: (system as { id: string }).id,
        scope_id: circleId,
        visibility: 'group',
        post_type: 'system',
        body,
      })
      if (!error) posted++
    }
    return posted
  } catch {
    return 0
  }
}

// ── IO: the one-tap "nudge a Circle-mate about to break theirs" ───────────────────

/** The result of a nudge: whether it reached the mate, and a short reason when it did not. */
export interface NudgeResult {
  nudged: boolean
  reason: 'sent' | 'not_circle_mates' | 'not_at_risk' | 'error'
}

/**
 * One member nudges a Circle-mate who is about to break their streak. Sends an in-app notification
 * (no email; this is an in-product, activation-shaped poke, not outbound marketing). FAIL-SAFE:
 * any error returns { nudged: false }. The two MUST share an active Circle (checked here), so a
 * member can only nudge someone actually in a room with them.
 *
 * authz: the call site (the server action) resolved `nudgerProfileId` from the session; this helper
 * additionally binds the nudge to a SHARED active Circle, so it cannot be used to poke a stranger.
 */
export async function nudgeCircleMate(nudgerProfileId: string, mateProfileId: string): Promise<NudgeResult> {
  if (nudgerProfileId === mateProfileId) return { nudged: false, reason: 'error' }
  try {
    const admin = createAdminClient()

    // Must share an active Circle (the scope that makes a nudge legitimate).
    const [{ data: mine }, { data: theirs }] = await Promise.all([
      admin.from('memberships').select('circle_id').eq('profile_id', nudgerProfileId).eq('status', 'active'),
      admin.from('memberships').select('circle_id').eq('profile_id', mateProfileId).eq('status', 'active'),
    ])
    const myCircles = new Set(((mine ?? []) as { circle_id: string | null }[]).map((m) => m.circle_id))
    const shared = ((theirs ?? []) as { circle_id: string | null }[]).some((m) => m.circle_id && myCircles.has(m.circle_id))
    if (!shared) return { nudged: false, reason: 'not_circle_mates' }

    // The poke is an in-app notification from the nudger to the mate. Best-effort.
    await admin.from('notifications').insert({
      recipient_id: mateProfileId,
      actor_id: nudgerProfileId,
      type: 'mention',
      reference_type: 'profile',
      reference_id: nudgerProfileId,
      body: 'nudged you to keep your streak going',
    })
    return { nudged: true, reason: 'sent' }
  } catch {
    return { nudged: false, reason: 'error' }
  }
}

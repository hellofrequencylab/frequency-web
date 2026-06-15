// The member progress spine — one read that folds activation, the daily practice
// streak, adopted Journeys and season rank into a single **stage**, plus the gates
// to the next one. This is what drives progressive disclosure (ADR-146): home
// surfaces reveal more as the stage climbs, and a "just unlocked" moment fires when
// it advances. The left nav stays fully visible — stages reveal *surfaces*, not
// areas (owner decision, 2026-06-06).

import { createAdminClient } from '@/lib/supabase/admin'
import { getOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding/status'
import { getPracticeStreak, type PracticeStreakState } from '@/lib/practice-streak'
import { getMemberJourneyProgress, type MemberJourneyProgress } from '@/lib/journeys/progress'
import { rankForCompletion, journeysFinishedThisSeason, getRankDef, SEASON_RANKS, RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'

// --- the ladder ------------------------------------------------------------

export type StageKey = 'newcomer' | 'finding_feet' | 'regular' | 'established' | 'anchor'

export interface MemberStage {
  key: StageKey
  /** 0..4 — comparable across stages. */
  index: number
  label: string
  /** What this stage is about — the one-line focus shown to the member. */
  tagline: string
}

export const MEMBER_STAGES: MemberStage[] = [
  { key: 'newcomer',     index: 0, label: 'Newcomer',          tagline: 'Get set up and find your footing.' },
  { key: 'finding_feet', index: 1, label: 'Finding your feet', tagline: 'Build the daily habit, one practice at a time.' },
  { key: 'regular',      index: 2, label: 'Regular',           tagline: 'Deepen it. Follow a Journey and show up for your circle.' },
  { key: 'established',  index: 3, label: 'Established',        tagline: 'Round it out across the four pillars.' },
  { key: 'anchor',       index: 4, label: 'Anchor',            tagline: 'You hold the room. Bring others into it.' },
]

export function stageByKey(key: StageKey): MemberStage {
  return MEMBER_STAGES.find((s) => s.key === key) ?? MEMBER_STAGES[0]
}

// Thresholds, named so the gates and the deriver can't drift apart.
const REGULAR_STREAK = 7
const ESTABLISHED_STREAK = 30
const ANCHOR_STREAK = 100
// Stage gates that previously used rank zaps now use Journey completions (ADR-Quest).
const ESTABLISHED_JOURNEYS = 1 // one Journey completion gates established
const ANCHOR_JOURNEYS = 2      // two Journey completions can gate anchor

// --- pure derivation -------------------------------------------------------

export interface ProgressSignals {
  activationComplete: boolean
  /** Current daily practice streak. */
  streak: number
  /** Adopted, active Journey plans. */
  journeys: number
  /** Active circle memberships. */
  circles: number
  /** Season Zaps (for the standing display). */
  seasonZaps: number
  /** Journeys finished this season (drives rank in the completion model). */
  journeysFinished: number
}

/** The member's stage from their signals. Monotonic in every signal. Pure. */
export function deriveStage(s: ProgressSignals): StageKey {
  if (!s.activationComplete) return 'newcomer'
  if (s.streak >= ANCHOR_STREAK || s.journeysFinished >= ANCHOR_JOURNEYS) return 'anchor'
  if (s.streak >= ESTABLISHED_STREAK || s.journeysFinished >= ESTABLISHED_JOURNEYS || s.journeys >= 2) return 'established'
  if (s.streak >= REGULAR_STREAK || s.journeys >= 1) return 'regular'
  return 'finding_feet'
}

export interface NextGate {
  label: string
  met: boolean
}

/** The checklist of ways to reach the *next* stage (any one advances). Pure. */
export function gatesFor(stage: StageKey, s: ProgressSignals): NextGate[] {
  switch (stage) {
    case 'newcomer':
      return [{ label: 'Finish setting up your account', met: s.activationComplete }]
    case 'finding_feet':
      return [
        { label: `Reach a ${REGULAR_STREAK}-day practice streak`, met: s.streak >= REGULAR_STREAK },
        { label: 'Adopt a Journey', met: s.journeys >= 1 },
      ]
    case 'regular':
      return [
        { label: `Reach a ${ESTABLISHED_STREAK}-day streak`, met: s.streak >= ESTABLISHED_STREAK },
        { label: 'Follow two Journeys', met: s.journeys >= 2 },
        { label: 'Finish a Journey this season', met: s.journeysFinished >= ESTABLISHED_JOURNEYS },
      ]
    case 'established':
      return [
        { label: `Reach a ${ANCHOR_STREAK}-day streak`, met: s.streak >= ANCHOR_STREAK },
        { label: 'Finish two Journeys this season', met: s.journeysFinished >= ANCHOR_JOURNEYS },
      ]
    case 'anchor':
      return []
  }
}

export function nextStage(stage: StageKey): MemberStage | null {
  const cur = stageByKey(stage)
  return MEMBER_STAGES.find((s) => s.index === cur.index + 1) ?? null
}

// --- the read --------------------------------------------------------------

export interface MemberProgress {
  stage: MemberStage
  next: MemberStage | null
  signals: ProgressSignals
  streakState: PracticeStreakState
  /** The member's standing counts — Zaps (season) + Gems (lifetime) — so a home
   *  surface can render the unified StandingTiles without a second read. */
  standing: {
    seasonZaps: number
    lifetimeGems: number
  }
  rank: {
    rank: SeasonRank
    label: string
    /** Zaps to the next rank, or null at the top. */
    toNextZaps: number | null
    nextLabel: string | null
  }
  nextGates: NextGate[]
  /** The stage is higher than the one the member last acknowledged. */
  justAdvanced: boolean
  /** The newly-reached stage when `justAdvanced`, for the celebration. */
  newlyUnlocked: MemberStage | null
  /** The raw activation status (reused by the home feed — fetched here once). */
  onboarding: OnboardingStatus
  /** The member's enrolled Journeys with v2 progress (reused by the home feed). */
  journeys: MemberJourneyProgress[]
}

/**
 * Compute a member's full progress + stage. One fan-out of the existing reads;
 * safe to call from a Server Component. `justAdvanced` compares the derived stage
 * to `profiles.meta.progressStage` (the last stage the member saw) — call
 * `acknowledgeStage` after showing the celebration so it fires exactly once.
 */
export async function getMemberProgress(profileId: string): Promise<MemberProgress> {
  const admin = createAdminClient()

  const [onboarding, streakState, journeys, { data: profile }, { count: circleCount }, finishedCount] =
    await Promise.all([
      getOnboardingStatus(profileId),
      getPracticeStreak(profileId),
      getMemberJourneyProgress(profileId),
      admin.from('profiles').select('current_season_zaps, lifetime_gems, meta').eq('id', profileId).maybeSingle(),
      admin
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('status', 'active'),
      journeysFinishedThisSeason(profileId),
    ])

  const seasonZaps = (profile?.current_season_zaps as number | null) ?? 0
  const lifetimeGems = (profile?.lifetime_gems as number | null) ?? 0
  const signals: ProgressSignals = {
    activationComplete: onboarding.complete,
    streak: streakState.current,
    journeys: journeys.length,
    circles: circleCount ?? 0,
    seasonZaps,
    journeysFinished: finishedCount,
  }

  const stageKey = deriveStage(signals)
  const stage = stageByKey(stageKey)
  const next = nextStage(stageKey)

  // Rank progress — completion-based (ADR-Quest).
  const rankKey = rankForCompletion(finishedCount)
  const rankDef = getRankDef(rankKey)
  const nextRankDef = SEASON_RANKS.find((r) => r.order === rankDef.order + 1) ?? null
  const rank = {
    rank: rankKey,
    label: RANK_LABELS[rankKey],
    toNextZaps: nextRankDef ? Math.max(0, nextRankDef.minJourneys - finishedCount) : null,
    nextLabel: nextRankDef ? nextRankDef.label : null,
  }

  const seenIndex = Number(
    ((profile?.meta as Record<string, unknown> | null)?.progressStage as number | undefined) ?? -1,
  )
  // Celebrate only genuine forward movement the member hasn't seen yet. The first
  // sighting (seenIndex < 0) never celebrates — it just establishes a baseline.
  const justAdvanced = seenIndex >= 0 && stage.index > seenIndex && stage.index > 0

  return {
    stage,
    next,
    signals,
    streakState,
    standing: { seasonZaps, lifetimeGems },
    rank,
    nextGates: gatesFor(stageKey, signals),
    justAdvanced,
    newlyUnlocked: justAdvanced ? stage : null,
    onboarding,
    journeys,
  }
}

/**
 * Record the highest stage a member has seen, so the "just unlocked" celebration
 * fires once. Called from a client action after the celebration renders (keeps
 * reads pure). Never moves backward.
 */
export async function acknowledgeStage(profileId: string, stageIndex: number): Promise<void> {
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (profile?.meta ?? {}) as Record<string, unknown>
  const seen = Number((meta.progressStage as number | undefined) ?? -1)
  if (stageIndex <= seen) return
  await (admin)
    .from('profiles')
    .update({ meta: { ...meta, progressStage: stageIndex } })
    .eq('id', profileId)
}

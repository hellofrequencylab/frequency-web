// Vera "Today" — the orchestrator that closes the loop (Resonance Engine Phase 1 ·
// ADR-382 · docs/NEXT-GEN-CRM.md "Vera as the operating system"). It turns the nightly
// predictions sitting in member_traits into exactly FIVE person-plus-action cards, each
// carrying its registry playbook + a pre-drafted "why now" line + an action draft, so the
// operator's home screen is inbox-zero of the moves that matter, not a dashboard.
//
// Two halves, deliberately split (the testability law, mirroring lib/traits/compute.ts +
// the lib/crm pure/IO split):
//   • PURE ranker (`rankTodayCandidates`) — no IO. Sorts candidates by
//     churn_risk x activation_propensity x next_best_action, hard-caps at FIVE, and
//     pushes the overflow to a "Later" shelf. Fully unit-tested (tie-breaks, the cap).
//   • IO (`buildTodayCards`) — reads member_traits + resolvePerson, drafts copy through
//     withVoice, and is FAIL-SAFE: any error yields an empty card list, never throws
//     (a broken Today must never break the operator's home screen).
//
// It REUSES the existing Vera runtime (the bounded tool surface + the voice primer); it
// does NOT invent a new agent loop. Drafting is best-effort: when AI is off or over
// budget, a deterministic in-voice line is used (graceful fallback, like the concierge).
//
// Read authz lives at the CALL SITE: an owner/staff-gated server action calls
// buildTodayCards() for the platform scope, or with a space_id for a per-Space scope.
// This module reads through the service-role admin client and binds every read to the
// scope it was handed.
//
// authz-delegated: this is a READ orchestrator. It performs no mutation; every write the
// cards propose runs later through the governed confirm-then-execute path
// (lib/ai/vera/execute.ts), self-guarded + send-gated there.

import type { ChurnRisk, NextBestAction, ScoreConfidence } from '@/lib/traits/compute'
import {
  playbookForChurnRisk,
  playbookForNextBestAction,
  effectiveAutonomyTier,
  type Playbook,
  type AutonomyTier,
} from '@/lib/playbooks/registry'
import { withVoice } from '@/lib/ai/voice'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'
import { readBreakerStatus } from '@/lib/playbooks/circuit-breaker'
import { autoExecutionAllowed } from '@/lib/spaces/entitlements'
import { getSpaceById } from '@/lib/spaces/store'
import { structuralRiskBoost, structuralRiskFromCircleTies, type StructuralRisk } from '@/lib/circles/social-fuel'

/** The HARD cap on Today cards. The cap is sacred (docs/NEXT-GEN-CRM.md): overflow goes
 *  to a "Later" shelf, never onto Today. */
export const TODAY_CARD_CAP = 5

/** The prediction signal for one member, read out of member_traits. The pure ranker's
 *  input — no IO, no person resolution, just the scores. */
export interface TodayCandidate {
  profileId: string
  churnRisk: ChurnRisk
  /** 0-100 activation propensity. */
  activationPropensity: number
  nextBestAction: NextBestAction
  /** Optional structural-risk band from Circle ties (Resonance Engine Phase 5 · ADR-386). A
   *  member with no Circle ties (`unanchored`) has no social anchor, so they are tilted up the
   *  ranking toward a connection move. Omitted = no tilt (Phase 1 to 3 callers unchanged). */
  structuralRisk?: StructuralRisk
}

/** A candidate after ranking: it carries its score and the playbook it resolves to. */
export interface RankedCandidate extends TodayCandidate {
  /** The composite resonance score (higher = more urgent). */
  score: number
  /** The registry playbook that fires for this candidate (never undefined: every
   *  next_best_action value is declared). */
  playbook: Playbook
}

/** The result of ranking: the top FIVE for Today, plus the overflow for "Later". */
export interface RankedToday {
  today: RankedCandidate[]
  later: RankedCandidate[]
}

const CHURN_WEIGHT: Record<ChurnRisk, number> = { high: 3, medium: 2, low: 1 }
// next_best_action urgency, most-urgent first (mirrors the priority ladder in
// lib/traits/compute.ts nextBestAction). `none` is the floor.
const NBA_WEIGHT: Record<NextBestAction, number> = {
  reengage: 6,
  activate: 5,
  invite: 4,
  deepen: 3,
  join_circle: 2,
  none: 0,
}

/** How much a member's structural risk (no Circle ties) tilts the score. Kept SMALL (a 20%
 *  lift at most) so it nudges an unanchored member up the order toward a connection move
 *  without overriding the churn x propensity x action core. */
const STRUCTURAL_TILT = 0.2

/**
 * The composite resonance score. churn_risk x activation_propensity x next_best_action,
 * per the plan. Pure + deterministic. A candidate the model says is sliding (high churn),
 * with room to move (activation propensity), and a concrete next move (a non-`none`
 * action) scores highest. activation_propensity is normalized to 0..1 with a small floor
 * so it lifts rather than zeroes a card whose propensity is 0.
 *
 * Phase 5 (ADR-386) folds in a MODEST structural-risk tilt: a member with no Circle ties is
 * lifted up the order (no social anchor = highest structural risk). It is MULTIPLICATIVE, so a
 * `none`-action card (score 0) stays 0, and a member with no structuralRisk set is unchanged.
 */
export function resonanceScore(c: TodayCandidate): number {
  const churn = CHURN_WEIGHT[c.churnRisk]
  const nba = NBA_WEIGHT[c.nextBestAction]
  const prop = 0.25 + 0.75 * (Math.max(0, Math.min(100, c.activationPropensity)) / 100)
  const tilt = 1 + STRUCTURAL_TILT * (c.structuralRisk ? structuralRiskBoost(c.structuralRisk) : 0)
  return churn * prop * nba * tilt
}

/**
 * Rank candidates into the Today cards + the Later shelf. PURE: no IO. Drops any
 * candidate whose next_best_action is `none` AND churn_risk is `low` (nothing to do).
 * Sorts by score desc, with a stable tie-break (churn weight, then profileId) so the
 * order is deterministic. Hard-caps Today at TODAY_CARD_CAP; the rest spill to Later.
 */
export function rankTodayCandidates(candidates: TodayCandidate[]): RankedToday {
  const ranked: RankedCandidate[] = []
  for (const c of candidates) {
    // Nothing to surface: steady AND low risk.
    if (c.nextBestAction === 'none' && c.churnRisk === 'low') continue
    // The card's playbook: a real next move wins; otherwise the churn tier's playbook.
    const playbook =
      c.nextBestAction !== 'none'
        ? playbookForNextBestAction(c.nextBestAction)
        : playbookForChurnRisk(c.churnRisk)
    if (!playbook) continue
    ranked.push({ ...c, score: resonanceScore(c), playbook })
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (CHURN_WEIGHT[b.churnRisk] !== CHURN_WEIGHT[a.churnRisk]) {
      return CHURN_WEIGHT[b.churnRisk] - CHURN_WEIGHT[a.churnRisk]
    }
    return a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0
  })

  return { today: ranked.slice(0, TODAY_CARD_CAP), later: ranked.slice(TODAY_CARD_CAP) }
}

// ── IO: the read side (fail-safe) ──────────────────────────────────────────────

/** One ready-to-render Today card. The orchestrator's output. */
export interface TodayCard {
  /** The CRM contact this card acts on (the timeline subject for in-product tools). */
  contactId: string
  /** The member behind the contact, when they have a login (for save_streak / send-gate). */
  subjectProfileId: string | null
  /** Display name, plain. */
  name: string
  /** The lifecycle / churn context line (e.g. "At risk"). */
  context: string
  /** The one concrete "why now" line, in voice. */
  whyNow: string
  /** The pre-drafted action line, in voice. */
  actionDraft: string
  /** The registry playbook id this card runs. */
  playbookId: string
  /** The playbook's name + autonomy tier (the operator-facing badge). */
  playbookName: string
  /** The EFFECTIVE tier after the per-Space autonomy slider (an `auto` playbook reads `suggest`
   *  when the Space is suggest_only). The UI badges + the execute path honor this, not the raw tier. */
  autonomyTier: AutonomyTier
  /** The composite score (for ordering + debugging). */
  score: number
  /** The confidence band behind this card's churn read (drives the confidence chip). */
  confidence: ScoreConfidence
  /** The top contributing signals (already plain, in voice), most-decisive first. The "top signals"
   *  line the card shows beneath "why now". A bare score is never shown (ADR-384). */
  signals: string[]
}

export interface TodayResult {
  cards: TodayCard[]
  laterCount: number
}

const EMPTY: TodayResult = { cards: [], laterCount: 0 }

type TraitRow = { profile_id: string; trait_key: string; value_num: number | null; value_text: string | null }
type ContactRow = { id: string; profile_id: string | null; display_name: string | null; email: string }

const CHURN_VALUES: readonly ChurnRisk[] = ['low', 'medium', 'high']
const NBA_VALUES: readonly NextBestAction[] = ['reengage', 'activate', 'join_circle', 'deepen', 'invite', 'none']

function asChurn(v: string | null): ChurnRisk | null {
  return v && (CHURN_VALUES as readonly string[]).includes(v) ? (v as ChurnRisk) : null
}
function asNba(v: string | null): NextBestAction | null {
  return v && (NBA_VALUES as readonly string[]).includes(v) ? (v as NextBestAction) : null
}

/** A plain context label from the prediction signal. In voice, no dashes. */
function contextLabel(c: TodayCandidate): string {
  if (c.churnRisk === 'high') return 'At risk'
  if (c.churnRisk === 'medium') return 'Cooling'
  return 'Steady'
}

// ── Explainability on the card (Resonance Engine Phase 3 · ADR-384) ──────────────
// A bare score is never shown. Each card carries the top contributing signals + a confidence band,
// derived PURELY from the candidate's prediction signals (the card only has the three traits, not
// the full feature vector, so this is a lightweight read; the full explainChurnRisk lives in
// lib/traits/compute.ts for the Person view where the inputs are richer).

const NBA_SIGNAL: Record<NextBestAction, string> = {
  reengage: 'gone quiet lately',
  activate: 'has not done a first Practice',
  join_circle: 'not anchored in a Circle',
  deepen: 'active but sticking to one corner',
  invite: 'a strong member with room to lead',
  none: 'steady for now',
}

/** The top contributing signals for a card, most-decisive first, plain + in voice (no dashes). PURE. */
export function cardSignals(c: TodayCandidate): string[] {
  const out: string[] = []
  if (c.churnRisk === 'high') out.push('about to slip away')
  else if (c.churnRisk === 'medium') out.push('starting to cool')
  if (c.nextBestAction !== 'none') out.push(NBA_SIGNAL[c.nextBestAction])
  if (c.activationPropensity >= 60) out.push('high room to move')
  else if (c.activationPropensity <= 15 && c.nextBestAction === 'activate') out.push('little early signal')
  if (out.length === 0) out.push('worth a light touch today')
  return out.slice(0, 3)
}

/** The card's confidence band, from how decisive its signals are. PURE. High when churn is high and a
 *  concrete move exists; low when the signal is thin (steady + low propensity); medium otherwise. */
export function cardConfidence(c: TodayCandidate): ScoreConfidence {
  if (c.churnRisk === 'high' && c.nextBestAction !== 'none') return 'high'
  if (c.churnRisk === 'low' && c.nextBestAction === 'none') return 'low'
  if (c.nextBestAction === 'activate' && c.activationPropensity <= 15) return 'low'
  return 'medium'
}

/** Deterministic, in-voice fallback lines (used when AI is off / over budget). */
function deterministicWhyNow(name: string, c: TodayCandidate): string {
  switch (c.nextBestAction) {
    case 'reengage':
      return `${name} has gone quiet. A warm note now keeps the tie from cooling.`
    case 'activate':
      return `${name} joined but has not done a first Practice yet.`
    case 'join_circle':
      return `${name} is around but not anchored in a Circle yet.`
    case 'deepen':
      return `${name} is active but sticking to one corner. Room to widen.`
    case 'invite':
      return `${name} is a strong member. Good time to ask them to bring people in.`
    default:
      return c.churnRisk === 'high'
        ? `${name} is about to slip. Worth a small move today.`
        : `${name} could use a light touch today.`
  }
}

/** The AI draft prompt: ground it in the real signal, ask for two short in-voice lines.
 *  withVoice prepends the canon so every word passes the brand voice (no dashes). */
const TODAY_SYSTEM = withVoice(
  `You write one Vera "Today" card for a community operator. You get a member's first name and their prediction signal (lifecycle risk + the recommended next move). Write EXACTLY two short lines, plain and concrete, no preamble, no dashes:
Line 1 ("why now"): one concrete reason this member needs attention today.
Line 2 ("action"): the single move to make, in plain words.
Return ONLY the two lines separated by a newline. Do not invent facts beyond the signal.`,
)

interface Drafted {
  whyNow: string
  actionDraft: string
}

/** Draft the two card lines. Best-effort AI, deterministic fallback. Never throws. */
async function draftCardLines(name: string, c: RankedCandidate): Promise<Drafted> {
  const fallback: Drafted = {
    whyNow: deterministicWhyNow(name, c),
    actionDraft: c.playbook.rationale,
  }
  try {
    if (!(await aiAvailable()) || (await featureOverBudget('today'))) return fallback
    const signal = JSON.stringify({
      name,
      churn_risk: c.churnRisk,
      activation_propensity: c.activationPropensity,
      next_best_action: c.nextBestAction,
      playbook: c.playbook.name,
    })
    const res = await completeText({
      system: TODAY_SYSTEM,
      messages: [{ role: 'user', content: signal }],
      tier: 'haiku',
      maxTokens: 120,
      cacheSystem: true,
    })
    await recordAiUsage({ feature: 'today', model: res.tier, usage: res.usage, costUsd: res.costUsd })
    const lines = (res.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length >= 2) return { whyNow: lines[0], actionDraft: lines[1] }
    if (lines.length === 1) return { whyNow: lines[0], actionDraft: fallback.actionDraft }
    return fallback
  } catch (e) {
    if (e instanceof AiUnavailableError) return fallback
    return fallback
  }
}

/**
 * Build the Today cards for a scope. FAIL-SAFE: any error returns an empty card list.
 * Pass a `spaceId` for a per-Space scope (only that Space's members), or omit it for the
 * platform scope. The caller MUST have authorized the scope (owner/staff, or the Space's
 * CRM capability) before calling. Service-role reads, bound to the scope handed in.
 */
export async function buildTodayCards(opts: { spaceId?: string | null } = {}): Promise<TodayResult> {
  try {
    const admin = createAdminClient()

    // 1. Read the three prediction traits for every member in one pass.
    const { data: traitData, error: traitErr } = await admin
      .from('member_traits')
      .select('profile_id, trait_key, value_num, value_text')
      .in('trait_key', ['churn_risk', 'activation_propensity', 'next_best_action'])
    if (traitErr || !traitData) return EMPTY

    const byMember = new Map<string, { churn?: ChurnRisk; prop?: number; nba?: NextBestAction }>()
    for (const r of traitData as TraitRow[]) {
      const slot = byMember.get(r.profile_id) ?? {}
      if (r.trait_key === 'churn_risk') slot.churn = asChurn(r.value_text) ?? slot.churn
      else if (r.trait_key === 'activation_propensity') slot.prop = r.value_num ?? slot.prop
      else if (r.trait_key === 'next_best_action') slot.nba = asNba(r.value_text) ?? slot.nba
      byMember.set(r.profile_id, slot)
    }

    // 1b. Circle ties for the candidate members (Resonance Engine Phase 5 · ADR-386). A member
    //     with zero ties is the highest STRUCTURAL risk (no social anchor), which tilts them up
    //     the ranking toward a connection move. FAIL-SAFE: if the read errors, the tilt is OMITTED
    //     for everyone (no structuralRisk set), so a broken read never invents urgency.
    const candidateIds = [...byMember.keys()]
    const tiesByMember = new Map<string, number>()
    let tiesRead = false
    if (candidateIds.length > 0) {
      const { data: tieRows, error: tieErr } = await admin
        .from('memberships')
        .select('profile_id')
        .eq('status', 'active')
        .in('profile_id', candidateIds)
      if (!tieErr && tieRows) {
        tiesRead = true
        for (const r of tieRows as { profile_id: string }[]) {
          tiesByMember.set(r.profile_id, (tiesByMember.get(r.profile_id) ?? 0) + 1)
        }
      }
    }

    const candidates: TodayCandidate[] = []
    for (const [profileId, s] of byMember) {
      if (!s.churn || !s.nba) continue
      candidates.push({
        profileId,
        churnRisk: s.churn,
        activationPropensity: typeof s.prop === 'number' ? s.prop : 0,
        nextBestAction: s.nba,
        // Only tilt when the ties read succeeded; otherwise leave it unset (no tilt).
        ...(tiesRead ? { structuralRisk: structuralRiskFromCircleTies(tiesByMember.get(profileId) ?? 0) } : {}),
      })
    }

    // 2. Rank (pure) and take the top five.
    const ranked = rankTodayCandidates(candidates)
    if (ranked.today.length === 0) return { cards: [], laterCount: ranked.later.length }

    // 2b. Circuit breaker + autonomy (Phase 3 · ADR-384). A PAUSED playbook never produces a card;
    //     a paused candidate spills to the Later count (still owed, just suppressed for safety). On a
    //     DEGRADED breaker read, fail-CLOSED for outbound: drop a paused-or-unknown outbound card; an
    //     in-product `auto` card may proceed. The autonomy slider (fail-closed to suggest_only) then
    //     decides the EFFECTIVE tier the cards carry.
    const breaker = await readBreakerStatus({ spaceId: opts.spaceId })
    const autoAllowed = opts.spaceId ? autoExecutionAllowed(await getSpaceById(opts.spaceId)) : false
    const survivors: RankedCandidate[] = []
    let suppressed = 0
    for (const c of ranked.today) {
      const isPaused = breaker.degraded
        ? c.playbook.autonomyTier !== 'auto' // degraded: suppress outbound, allow in-product auto
        : breaker.paused.has(c.playbook.id)
      if (isPaused) suppressed += 1
      else survivors.push(c)
    }
    const gated: RankedToday = { today: survivors, later: ranked.later }
    if (survivors.length === 0) return { cards: [], laterCount: ranked.later.length + suppressed }

    // 3. Resolve each top candidate to a CRM contact, scoped. A member without a contact
    //    row (no email match) is skipped fail-closed (no card we cannot act on).
    const topProfileIds = survivors.map((c) => c.profileId)
    const contactQuery = admin
      .from('contacts')
      .select('id, profile_id, display_name, email')
      .in('profile_id', topProfileIds)
    if (opts.spaceId) {
      // Per-Space scope: only contacts whose touches/ownership are in this Space. The
      // contacts table has no space_id; the per-Space contact set is the on-board CRM
      // contacts (ADR-376). We bind via the space-scoped contact ids when scoped.
      const { data: spaceContactRows } = await admin
        .from('contact_interactions')
        .select('subject_id')
        .eq('space_id', opts.spaceId)
        .eq('subject_kind', 'contact')
      const allowed = new Set(((spaceContactRows ?? []) as { subject_id: string }[]).map((r) => r.subject_id))
      // When a Space has no scoped contacts yet, there is nothing to show (fail-closed).
      if (allowed.size === 0) return { cards: [], laterCount: ranked.later.length + suppressed }
      const { data: contactData } = await contactQuery
      const rows = ((contactData ?? []) as ContactRow[]).filter((r) => allowed.has(r.id))
      return assembleCards(gated, rows, autoAllowed, suppressed)
    }
    const { data: contactData, error: contactErr } = await contactQuery
    if (contactErr) return EMPTY
    return assembleCards(gated, (contactData ?? []) as ContactRow[], autoAllowed, suppressed)
  } catch {
    return EMPTY
  }
}

/** Draft + shape the cards from the ranked candidates + their resolved contacts. `autoAllowed` is the
 *  per-Space autonomy gate (false = suggest_only default), which sets each card's EFFECTIVE tier;
 *  `suppressedCount` is how many cards the circuit breaker paused (they roll into the Later count). */
async function assembleCards(
  ranked: RankedToday,
  contactRows: ContactRow[],
  autoAllowed: boolean,
  suppressedCount: number,
): Promise<TodayResult> {
  const contactByProfile = new Map<string, ContactRow>()
  for (const r of contactRows) {
    if (r.profile_id && !contactByProfile.has(r.profile_id)) contactByProfile.set(r.profile_id, r)
  }

  const drafted = await Promise.all(
    ranked.today.map(async (c) => {
      const contact = contactByProfile.get(c.profileId)
      if (!contact) return null
      const name = (contact.display_name || contact.email.split('@')[0] || 'This member').trim()
      const lines = await draftCardLines(name, c)
      const card: TodayCard = {
        contactId: contact.id,
        subjectProfileId: contact.profile_id,
        name,
        context: contextLabel(c),
        whyNow: lines.whyNow,
        actionDraft: lines.actionDraft,
        playbookId: c.playbook.id,
        playbookName: c.playbook.name,
        // The EFFECTIVE tier after the per-Space autonomy slider (auto -> suggest when suggest_only).
        autonomyTier: effectiveAutonomyTier(c.playbook.autonomyTier, autoAllowed),
        score: c.score,
        confidence: cardConfidence(c),
        signals: cardSignals(c),
      }
      return card
    }),
  )

  const cards = drafted.filter((c): c is TodayCard => c !== null)
  // Cards we could not resolve to a contact, plus the breaker-suppressed ones, roll into Later (owed).
  const dropped = ranked.today.length - cards.length
  return { cards, laterCount: ranked.later.length + dropped + suppressedCount }
}

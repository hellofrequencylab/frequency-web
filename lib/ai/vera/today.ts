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

import type { ChurnRisk, NextBestAction } from '@/lib/traits/compute'
import {
  playbookForChurnRisk,
  playbookForNextBestAction,
  type Playbook,
} from '@/lib/playbooks/registry'
import { withVoice } from '@/lib/ai/voice'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'

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

/**
 * The composite resonance score. churn_risk x activation_propensity x next_best_action,
 * per the plan. Pure + deterministic. A candidate the model says is sliding (high churn),
 * with room to move (activation propensity), and a concrete next move (a non-`none`
 * action) scores highest. activation_propensity is normalized to 0..1 with a small floor
 * so it lifts rather than zeroes a card whose propensity is 0.
 */
export function resonanceScore(c: TodayCandidate): number {
  const churn = CHURN_WEIGHT[c.churnRisk]
  const nba = NBA_WEIGHT[c.nextBestAction]
  const prop = 0.25 + 0.75 * (Math.max(0, Math.min(100, c.activationPropensity)) / 100)
  return churn * prop * nba
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
  autonomyTier: Playbook['autonomyTier']
  /** The composite score (for ordering + debugging). */
  score: number
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

    const candidates: TodayCandidate[] = []
    for (const [profileId, s] of byMember) {
      if (!s.churn || !s.nba) continue
      candidates.push({
        profileId,
        churnRisk: s.churn,
        activationPropensity: typeof s.prop === 'number' ? s.prop : 0,
        nextBestAction: s.nba,
      })
    }

    // 2. Rank (pure) and take the top five.
    const ranked = rankTodayCandidates(candidates)
    if (ranked.today.length === 0) return { cards: [], laterCount: ranked.later.length }

    // 3. Resolve each top candidate to a CRM contact, scoped. A member without a contact
    //    row (no email match) is skipped fail-closed (no card we cannot act on).
    const topProfileIds = ranked.today.map((c) => c.profileId)
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
      if (allowed.size === 0) return { cards: [], laterCount: ranked.later.length }
      const { data: contactData } = await contactQuery
      const rows = ((contactData ?? []) as ContactRow[]).filter((r) => allowed.has(r.id))
      return assembleCards(ranked, rows)
    }
    const { data: contactData, error: contactErr } = await contactQuery
    if (contactErr) return EMPTY
    return assembleCards(ranked, (contactData ?? []) as ContactRow[])
  } catch {
    return EMPTY
  }
}

/** Draft + shape the cards from the ranked candidates + their resolved contacts. */
async function assembleCards(ranked: RankedToday, contactRows: ContactRow[]): Promise<TodayResult> {
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
        autonomyTier: c.playbook.autonomyTier,
        score: c.score,
      }
      return card
    }),
  )

  const cards = drafted.filter((c): c is TodayCard => c !== null)
  // Cards we could not resolve to a contact roll into the Later count (still owed).
  const dropped = ranked.today.length - cards.length
  return { cards, laterCount: ranked.later.length + dropped }
}

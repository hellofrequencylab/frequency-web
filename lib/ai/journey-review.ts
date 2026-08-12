// Vera's quality gate for member-built Journeys (the Quest's "Gate + coach", ADR-Quest).
//
// Publishing a Journey to the library stays open and easy; this gate decides only whether
// FINISHING it can count toward season rank (journey_plans.ranked_eligible). Vera reviews
// the Journey against the Journey Creation rubric
// (content/leader-training/authoring/how-to-create-a-journey.md), returns a structured verdict,
// and coaches the author in the brand voice.
//
// SINCE ADR-993 this file is the JOURNEY half of that: it loads the Journey, renders it as the
// content the model reads, and hands it to the shared gate (lib/ai/quality-gate.ts), which owns
// the prompt, the rubric loading, the budget check, the forced-tool call, and the coercion. The
// Journey's standard (the 'journey-review' budget key, Opus, the 70 bar, the rubric doc, and the
// exact member-facing fail-closed copy) is declared there as DATA, so nothing about this gate's
// behaviour changed and any other entity can now have one.
//
// Server-only. FAIL-CLOSED is still the law: if AI is off, over budget, the call fails, or the
// model returns nothing usable, the verdict is `status: 'pending'` and the caller must NOT set
// ranked_eligible. An unreviewed Journey never counts toward rank.

import { coerceVerdict, pendingVerdict, qualityStandardFor, runQualityGate } from './quality-gate'
import { getPlan, type JourneyPlanItem } from '@/lib/journey-plans'
import { getPillars, pillarsById } from '@/lib/pillars'
import { createAdminClient } from '@/lib/supabase/admin'

/** The verdict Vera returns. `approved` is the only status that makes a Journey ranked-eligible.
 *  `pending` is the safe fail-closed state (AI off / over budget / call failed) — never approved. */
export interface JourneyReview {
  status: 'approved' | 'rejected' | 'pending'
  /** 0–100 against the authoring standard. A passing Journey scores PASS_SCORE or above. */
  score: number
  /** Concrete, kind, specific coaching lines in the brand voice (the "coach" half). */
  feedback: string[]
  reviewedAt: string
}

/** The Journey's declared standard (lib/ai/quality-gate.ts): the rubric doc, the Opus tier, the
 *  'journey-review' budget key, the 70 bar, and the exact fail-closed copy members read. */
const STANDARD = qualityStandardFor('journey')

/** The score at or above which a Journey passes the gate. The model also gives a verdict, but
 *  the score is the deterministic floor so "approved" can never drift below the bar. */
export const PASS_SCORE = STANDARD.passScore

/** The feature key for the budget cap (lib/ai/budget.ts) + the usage ledger. */
export const REVIEW_FEATURE = STANDARD.feature

/** Build the per-Journey content block the model reviews: premise/summary/intro, then each
 *  practice with its weight class + Pillar. Kept compact. */
function buildJourneyContent(
  plan: { title: string; summary: string | null; intro: string | null },
  practices: { title: string; description: string | null; weightClass: string | null; pillar: string | null }[],
): string {
  const lines: string[] = [
    `Title: ${plan.title}`,
    plan.summary ? `Premise / summary: ${plan.summary}` : 'Premise / summary: (none given)',
  ]
  if (plan.intro) lines.push(`Story / intro:\n${plan.intro.slice(0, 2000)}`)
  lines.push('', `Practices (${practices.length}):`)
  if (practices.length === 0) {
    lines.push('(none — this Journey has no practices yet)')
  } else {
    practices.forEach((p, i) => {
      const weight = p.weightClass ?? 'unweighted'
      const pillar = p.pillar ?? 'no pillar'
      lines.push(
        `${i + 1}. ${p.title} [${weight} · ${pillar}]${p.description ? ` — ${p.description.slice(0, 200)}` : ''}`,
      )
    })
  }
  lines.push(
    '',
    'Note: member-built library Journeys carry no Expression Challenge of their own; judge the premise, the spread of practices, and whether it could carry someone for four weeks.',
  )
  return lines.join('\n')
}

/** A safe fail-closed verdict: never approved. The shared gate's `pendingVerdict`, narrowed back
 *  to the Journey's own shape (which carries no `entity`, so every existing caller is unchanged). */
function pendingReview(feedback: string[]): JourneyReview {
  const { status, score, reviewedAt } = pendingVerdict('journey', feedback)
  return { status, score, feedback, reviewedAt }
}

/** Resolve a planId to its slug, then load the full plan + items (the read shape getPlan gives). */
async function loadPlanById(planId: string): Promise<Awaited<ReturnType<typeof getPlan>>> {
  const { data } = await createAdminClient()
    .from('journey_plans')
    .select('slug')
    .eq('id', planId)
    .maybeSingle()
  const slug = (data as { slug: string } | null)?.slug
  if (!slug) return null
  return getPlan(slug)
}

/** The reviewable practice shape the prompt needs. */
interface ReviewPractice {
  title: string
  description: string | null
  weightClass: string | null
  pillar: string | null
}

/** Look up the weight_class for a set of practice ids. `journey_plan_items.practice` doesn't
 *  carry weight_class (it isn't in the shared ITEM_COLS select), so the gate reads it directly
 *  rather than widening the lib surface. Returns a map; missing ids resolve to null. */
async function weightClassesFor(practiceIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (practiceIds.length === 0) return out
  const { data } = await createAdminClient()
    .from('practices')
    .select('id, weight_class')
    .in('id', practiceIds)
  for (const row of (data as { id: string; weight_class: string | null }[] | null) ?? []) {
    out.set(row.id, row.weight_class)
  }
  return out
}

/** Map a Journey's items to the practice shape the prompt needs (weight class + Pillar name). */
function toReviewPractices(
  items: JourneyPlanItem[],
  pillarMap: Map<string, { name: string }>,
  weightByPractice: Map<string, string | null>,
): ReviewPractice[] {
  return items
    .filter((it) => (it.block_type ?? 'practice') === 'practice' && it.practice)
    .map((it) => {
      const domainId = it.domain_id ?? it.practice?.domain_id ?? null
      return {
        title: it.practice?.title ?? 'Untitled practice',
        description: it.practice?.description ?? null,
        weightClass: it.practice_id ? weightByPractice.get(it.practice_id) ?? null : null,
        pillar: domainId ? pillarMap.get(domainId)?.name ?? null : null,
      }
    })
}

/**
 * Review a member-built Journey against the authoring standard and return a verdict +
 * coaching. NEVER throws — every failure path returns a fail-closed `pending` verdict so
 * the caller can publish the Journey without making it ranked-eligible.
 *
 * @param planId the Journey to review (its id, not slug). Authorship is the caller's concern.
 */
export async function reviewJourneyForLibrary(planId: string): Promise<JourneyReview> {
  // 1) Load the Journey + its practices (with weight class + Pillar). A plan we can't load
  //    can't be fairly reviewed — fail closed. (The kill switch + the budget check live in the
  //    shared gate, which runs next; loading first costs one cheap read and lets a missing plan
  //    say so plainly instead of blaming the budget.)
  let loaded: Awaited<ReturnType<typeof getPlan>> = null
  try {
    loaded = await loadPlanById(planId)
  } catch {
    loaded = null
  }
  if (!loaded) {
    return pendingReview(["Vera couldn't read this Journey to review it. Try submitting it again."])
  }

  const { plan, items } = loaded
  const practiceIds = items
    .filter((it) => (it.block_type ?? 'practice') === 'practice' && it.practice_id)
    .map((it) => it.practice_id)
  const [pillars, weightByPractice] = await Promise.all([
    getPillars().catch(() => []),
    weightClassesFor(practiceIds).catch(() => new Map<string, string | null>()),
  ])
  const pillarMap = pillarsById(pillars)
  const practices = toReviewPractices(items, pillarMap, weightByPractice)
  const content = buildJourneyContent({ title: plan.title, summary: plan.summary, intro: plan.intro }, practices)

  // 2) The shared gate: kill switch, budget cap, rubric, the forced-tool Opus call, and the
  //    coercion. It never throws, and every failure path is already a fail-closed `pending`.
  const verdict = await runQualityGate(STANDARD, content)
  return { status: verdict.status, score: verdict.score, feedback: verdict.feedback, reviewedAt: verdict.reviewedAt }
}

/** Coerce the raw tool input into a trustworthy verdict. The score is the deterministic
 *  gate: a model "approved" with a sub-bar score is downgraded to rejected, so eligibility
 *  can't drift below PASS_SCORE no matter what the model says. Kept as the Journey's own
 *  (entity-free) shape so its unit tests and callers are unchanged. */
export function coerce(raw: unknown): JourneyReview | null {
  const verdict = coerceVerdict(raw, 'journey', PASS_SCORE)
  if (!verdict) return null
  return { status: verdict.status, score: verdict.score, feedback: verdict.feedback, reviewedAt: verdict.reviewedAt }
}

// Vera's quality gate for member-built Journeys (the Quest's "Gate + coach", ADR-Quest).
//
// Publishing a Journey to the library stays open and easy; this gate decides only whether
// FINISHING it can count toward season rank (journey_plans.ranked_eligible). Vera reviews
// the Journey against the Journey Creation rubric (content/leader-training/how-to-create-a-journey.md),
// returns a structured verdict, and coaches the author in the brand voice.
//
// Server-only. Mirrors the house AI pattern (lib/ai/journey-outline.ts,
// lib/ai/practice-wizard.ts): the voice primer is injected, the call is a forced-tool
// structured output, the usage ledger records spend, and every field is re-coerced
// because we never trust the raw model shape.
//
// FAIL-CLOSED is the law here: if AI is off, over budget, the call fails, or the model
// returns nothing usable, we return a `status: 'pending'` verdict and the caller must NOT
// set ranked_eligible. An unreviewed Journey never counts toward rank.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, aiAvailable, featureOverBudget } from './usage'
import { withVoice } from './voice'
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

/** The score at or above which a Journey passes the gate. The model also gives a verdict, but
 *  the score is the deterministic floor so "approved" can never drift below the bar. */
export const PASS_SCORE = 70

/** The feature key for the budget cap (lib/ai/budget.ts) + the usage ledger. */
export const REVIEW_FEATURE = 'journey-review'

const TOOL_NAME = 'submit_journey_review'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    'Submit the quality verdict + coaching for this member-built Journey, judged against the Journey Creation standard.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: ['approved', 'rejected'],
        description:
          'approved = clears the bar to count toward season rank; rejected = needs work first.',
      },
      score: {
        type: 'number',
        description: 'How well it meets the standard, 0 to 100. 70 or above passes. Be fair but honest.',
      },
      feedback: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Two to five short coaching lines for the author, in second person. Concrete and specific: name what works and the exact next change. Kind, plain, no hype, no em dashes. On a rejection, lead with the one change that matters most.',
      },
    },
    required: ['verdict', 'score', 'feedback'],
  },
}

const SYSTEM_TEMPLATE = `You are Vera, Frequency's guide, reviewing a member-built Journey for the community library. Your job is the quality gate: decide whether finishing this Journey should count toward a member's season rank, and coach the author so they can get there.

Publishing is already open. You are NOT deciding whether it can be shared. You are only deciding whether it is good enough to count toward RANK, which must stay meaningful. Hold the bar, and be generous with help.

Judge it against the Journey Creation standard below (the five rules and the anatomy: a problem-first premise, five weight-classed practices each with a five-minute floor anchored to a daily routine, a daily loop, and a capstone). A Journey that ignores the standard does not pass, however nice it sounds.

THE STANDARD
{{RUBRIC}}

How to score and coach:
- approved (score 70 or above): the premise names a real shift, the practices range across effort and pillar and could be done on a bad day, and the whole thing could plausibly carry someone for four weeks. Small gaps are fine.
- rejected (score below 70): a vague or hype premise, too few or all-same-weight practices, no daily-doable floor, or nothing that pays off in the first week.
- feedback: two to five lines, in second person, that a real author can act on today. Name one thing that works, then the exact next change. Never narrate their feelings. Never invent facts about them or the audience.

Always call ${TOOL_NAME}. Do not answer in prose.`

// The authoring standard the gate judges against, loaded once per process from the
// leader-training doc (the single source of truth for the rubric). Cached because it is
// large + stable; the front-matter is stripped so only the guidance reaches the model.
let rubricCache: string | undefined
async function getRubricText(): Promise<string> {
  if (rubricCache !== undefined) return rubricCache
  try {
    const path = join(process.cwd(), 'content', 'leader-training', 'how-to-create-a-journey.md')
    const raw = await readFile(path, 'utf8')
    rubricCache = raw.replace(/^---[\s\S]*?---\n/, '').trim()
  } catch {
    // A compact fallback so the gate still has a standard if the file can't be read.
    rubricCache = `A Journey people finish: a problem-first premise (one line, the shift it creates); five practices tagged Light, Standard, or Heavy, each with a five-minute floor and anchored to a daily routine; a daily loop (a nudge, a tiny action, an instant Zap, visible progress); a capstone that pushes the member to express something. Win the first week. Plain names, no hype.`
  }
  return rubricCache
}

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

/** A safe fail-closed verdict: never approved. */
function pendingReview(feedback: string[]): JourneyReview {
  return { status: 'pending', score: 0, feedback, reviewedAt: new Date().toISOString() }
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
  // 1) Kill switch + budget. Fail closed: an unreviewed Journey is not ranked-eligible.
  if (!(await aiAvailable())) {
    return pendingReview([
      "Vera's review is paused right now, so this isn't counting toward rank yet. Your Journey is still live in the library. Submit it for review again later.",
    ])
  }
  if (await featureOverBudget(REVIEW_FEATURE)) {
    return pendingReview([
      "Vera's review is taking a breather for today. Your Journey is live in the library. Submit it for review again tomorrow to have it count toward rank.",
    ])
  }

  const client = getAnthropic()
  if (!client) {
    return pendingReview(["Vera's review isn't available right now. Your Journey is still live. Try again later."])
  }

  // 2) Load the Journey + its practices (with weight class + Pillar). A plan we can't load
  //    can't be fairly reviewed — fail closed.
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

  // 3) The forced-tool review call. The rubric is the standard, the voice primer keeps the
  //    coaching on-voice, and the system prompt is cached (it's large + stable across reviews).
  const system = withVoice(SYSTEM_TEMPLATE.replace('{{RUBRIC}}', await getRubricText()))
  try {
    const res = await client.messages.create({
      model: MODELS.opus,
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        { role: 'user', content: `Review this member-built Journey and call ${TOOL_NAME}:\n\n${content}` },
      ],
    })
    const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
    void recordAiUsage({
      feature: REVIEW_FEATURE,
      model: MODELS.opus,
      usage,
      costUsd: estimateCostUsd('opus', usage),
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    const verdict = block ? coerce(block.input) : null
    if (!verdict) {
      return pendingReview([
        "Vera couldn't finish reviewing this one. Your Journey is live in the library. Submit it for review again to count toward rank.",
      ])
    }
    return verdict
  } catch {
    return pendingReview([
      "Vera's review hit a snag. Your Journey is live in the library. Submit it for review again to count toward rank.",
    ])
  }
}

/** Coerce the raw tool input into a trustworthy verdict. The score is the deterministic
 *  gate: a model "approved" with a sub-bar score is downgraded to rejected, so eligibility
 *  can't drift below PASS_SCORE no matter what the model says. */
export function coerce(raw: unknown): JourneyReview | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const rawScore = typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : NaN
  if (Number.isNaN(rawScore)) return null
  const score = Math.min(100, Math.max(0, Math.round(rawScore)))

  const feedback = Array.isArray(r.feedback)
    ? r.feedback
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : []
  if (feedback.length === 0) return null

  // Verdict = the model's call AND the score bar. Both must agree to approve.
  const modelApproved = r.verdict === 'approved'
  const status: JourneyReview['status'] = modelApproved && score >= PASS_SCORE ? 'approved' : 'rejected'

  return { status, score, feedback, reviewedAt: new Date().toISOString() }
}

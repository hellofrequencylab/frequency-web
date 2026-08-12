// ─────────────────────────────────────────────────────────────────────────────
// THE PRE-PUBLISH QUALITY GATE (ADR-993).
//
// One entity-agnostic "is this good enough?" read, generalized out of the Journey rank gate
// (lib/ai/journey-review.ts, ADR-Quest), which was a real quality bar that exactly one entity
// had. Any entity can now opt in: call `runQualityGate` with its standard and the content to
// judge, and get back a verdict plus coaching in the brand voice.
//
// WHY THIS MATTERS MORE AS SEEDING SCALES: the Spark drafts fast, and fast drafting is how a
// library fills with slop. A gate that reads the finished draft against a written standard is
// the thing that stops it. It is a READ, never a writer: it returns a verdict, and the CALLER
// decides what to do with it. Nothing here publishes, edits, or flags anything on its own.
//
// FAIL-CLOSED IS THE LAW. If AI is off, over budget, unconfigured, erroring, or returns a shape
// we cannot trust, the verdict is `pending` with a score of 0. `pending` is NEVER a pass. A
// caller that treats "not rejected" as approval has misread this file: check `status === 'approved'`.
//
// BUDGET: every standard carries its own feature key, so a gate's spend is capped and visible
// per entity in the ledger (lib/ai/budget.ts). Journeys keep 'journey-review' at Opus, exactly
// as before; everything else shares 'entity-review' at Sonnet.
//
// Voice canon (docs/CONTENT-VOICE.md): the coaching is plain, second person, no em dashes.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS, type ModelTier } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, aiAvailable, featureOverBudget } from './usage'
import { withVoice } from './voice'

// ── The verdict ──────────────────────────────────────────────────────────────────────────

/**
 * What a gate returns. `approved` is the ONLY status that means "this cleared the bar".
 * `pending` is the fail-closed state (AI off, over budget, call failed, unusable shape) and must
 * never be treated as a pass.
 */
export interface QualityVerdict {
  /** The entity this verdict is about (the manifest / registry id). */
  entity: string
  status: 'approved' | 'rejected' | 'pending'
  /** 0 to 100 against the standard. A pass is `>= standard.passScore`. */
  score: number
  /** Two to five concrete coaching lines, second person, in the brand voice. */
  feedback: string[]
  reviewedAt: string
}

/** The plain lines a member reads when the gate could not run. Each standard supplies its own so
 *  the copy tells the truth about THAT entity ("your Journey is still live in the library"). */
export interface PendingCopy {
  /** The kill switch is off, or AI is not configured. */
  paused: string
  /** The daily budget for this gate is spent. */
  budget: string
  /** The call failed, or the model returned something unusable. */
  failed: string
}

/**
 * ONE entity's quality standard. This is the opt-in: declare a standard, call the gate, and the
 * entity has a pre-publish read. Nothing else about the entity changes.
 */
export interface QualityStandard {
  /** The entity id (matches the Studio manifest / registry key and the AI feature prefix). */
  entity: string
  /** Member-facing name, used in the prompt and the fallback rubric. */
  label: string
  /** The budget key (lib/ai/budget.ts) AND the usage-ledger feature. Every standard must have one. */
  feature: string
  /** The model tier. Deliberate per standard: the Journey gate decides RANK, so it stays Opus. */
  tier: ModelTier
  /** The score at or above which the entity passes. The deterministic floor under the model's verdict. */
  passScore: number
  /** One plain line naming what this verdict actually decides. Goes into the prompt. */
  stakes: string
  /**
   * The doc that IS the standard: a FILENAME under `content/leader-training/authoring`, loaded once
   * per process.
   *
   * ⚠️ A FILENAME, not a path, and that is load-bearing rather than tidy. This was
   * `rubricPath: readonly string[]` spread into `join(process.cwd(), ...segments)`. @vercel/nft
   * cannot resolve a spread of a runtime array, so it fell back to globbing everything under the
   * value it COULD resolve — the repo root — and traced the result into every serverless function
   * whose graph reaches this module. Measured on the re-land build: **57.23 GB** of function
   * payload, with `docs/DECISIONS.md`, the e2e screenshot baselines and `public/tracks/*.mp3` all
   * being copied into ~300 lambdas that have no use for any of them.
   *
   * Keeping the directory a static literal (RUBRIC_DIR below) bounds that glob to one small folder.
   * See docs/DEPLOY-SAFETY.md rule 2 and ADR-1003; `pnpm check:build-budget` is the gate.
   */
  rubricFile?: string
  /** The compact standard used when there is no doc, or the doc cannot be read. Always required. */
  fallbackRubric: string
  /** Extra shaping for the model (a master template, a house format). Optional. */
  guidance?: string
  /** The fail-closed copy. */
  pending: PendingCopy
  /** Response budget. Coaching is short; 1200 covers a verdict plus five lines. */
  maxTokens?: number
}

// ── The structured-output tool ───────────────────────────────────────────────────────────

const TOOL_NAME = 'submit_quality_review'

function tool(standard: QualityStandard): Anthropic.Tool {
  return {
    name: TOOL_NAME,
    description: `Submit the quality verdict + coaching for this ${standard.label}, judged against the standard you were given.`,
    input_schema: {
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: ['approved', 'rejected'],
          description: `approved = clears the bar; rejected = needs work first. ${standard.stakes}`,
        },
        score: {
          type: 'number',
          description: `How well it meets the standard, 0 to 100. ${standard.passScore} or above passes. Be fair but honest.`,
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
}

/** The system prompt. One template for every entity: the standard is DATA, not a second prompt. */
function systemFor(standard: QualityStandard, rubric: string): string {
  return `You are Vera, Frequency's guide, reviewing a member-built ${standard.label} before it goes out. Your job is the quality gate: decide whether it clears the bar, and coach the author so they can get there.

${standard.stakes}

Judge it against the standard below. Hold the bar, and be generous with help.

THE STANDARD
${rubric}${standard.guidance ? `\n\nALSO HOLD IN MIND\n${standard.guidance}` : ''}

How to score and coach:
- approved (score ${standard.passScore} or above): it does what this kind of thing is for, it is specific rather than generic, and a real person could use it as written. Small gaps are fine.
- rejected (score below ${standard.passScore}): vague or hype copy, missing the substance the standard asks for, or nothing a reader could actually act on.
- feedback: two to five lines, in second person, that a real author can act on today. Name one thing that works, then the exact next change. Never narrate their feelings. Never invent facts about them or their audience.

Always call ${TOOL_NAME}. Do not answer in prose.`
}

// ── The rubric loader ────────────────────────────────────────────────────────────────────

// Cached per resolved path because rubric docs are large and stable; the front matter is stripped
// so only the guidance reaches the model.
const rubricCache = new Map<string, string>()

/**
 * The ONE directory authoring standards live in. A STATIC literal on purpose: it is the bound on
 * what Next's file tracer sweeps into a serverless bundle when it meets the dynamic filename below.
 * Do not rebuild this from parts of the standard.
 */
const RUBRIC_DIR = join(process.cwd(), 'content', 'leader-training', 'authoring')

/** Load a standard's rubric doc, falling back to its compact inline standard. Never throws. */
export async function loadRubric(standard: QualityStandard): Promise<string> {
  if (!standard.rubricFile) return standard.fallbackRubric
  const path = join(RUBRIC_DIR, standard.rubricFile)
  const cached = rubricCache.get(path)
  if (cached !== undefined) return cached
  try {
    const raw = await readFile(path, 'utf8')
    const text = raw.replace(/^---[\s\S]*?---\n/, '').trim() || standard.fallbackRubric
    rubricCache.set(path, text)
    return text
  } catch (err) {
    // Log loudly: a read miss means the gate is judging against the compact fallback, not the real
    // authoring doc. The fallback keeps the gate working; the warning keeps the miss from being silent.
    console.warn(
      `[quality-gate] could not read the ${standard.entity} standard at ${path}; using the inline fallback.`,
      err,
    )
    rubricCache.set(path, standard.fallbackRubric)
    return standard.fallbackRubric
  }
}

// ── The fail-closed verdict ──────────────────────────────────────────────────────────────

/** A safe, fail-closed verdict: never approved, score 0. */
export function pendingVerdict(entity: string, feedback: string[]): QualityVerdict {
  return { entity, status: 'pending', score: 0, feedback, reviewedAt: new Date().toISOString() }
}

/**
 * Coerce the raw tool input into a trustworthy verdict, or null when the shape is unusable.
 * The score is the deterministic gate: a model "approved" with a sub-bar score is downgraded to
 * rejected, so a pass can never drift below `passScore` no matter what the model says. PURE.
 */
export function coerceVerdict(raw: unknown, entity: string, passScore: number): QualityVerdict | null {
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
  const status: QualityVerdict['status'] = modelApproved && score >= passScore ? 'approved' : 'rejected'

  return { entity, status, score, feedback, reviewedAt: new Date().toISOString() }
}

// ── The gate ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one entity's pre-publish quality read. NEVER throws: every failure path returns a
 * fail-closed `pending` verdict, so a caller can always finish what it was doing (publish the
 * thing, show the draft) without the gate being able to break it.
 *
 * `content` is the entity rendered as plain text for the model. The caller owns that rendering,
 * because only the caller knows what its entity is made of. Keep it compact; it is the input
 * cost.
 *
 * AUTHZ: none here, deliberately. This function judges text it was handed; whoever is allowed to
 * ask for a review is the calling action's concern.
 */
export async function runQualityGate(standard: QualityStandard, content: string): Promise<QualityVerdict> {
  // 1) Kill switch + budget. Fail closed: an unreviewed thing is never approved.
  if (!(await aiAvailable())) return pendingVerdict(standard.entity, [standard.pending.paused])
  if (await featureOverBudget(standard.feature)) return pendingVerdict(standard.entity, [standard.pending.budget])
  if (!aiEnabled()) return pendingVerdict(standard.entity, [standard.pending.paused])

  const body = (content ?? '').trim()
  if (!body) return pendingVerdict(standard.entity, [standard.pending.failed])

  // 2) The forced-tool review call. The rubric is the standard, the voice primer keeps the coaching
  //    on-voice, and the system prompt is cached (it is large and stable across reviews).
  const system = withVoice(systemFor(standard, await loadRubric(standard)))
  try {
    const res = await completeRaw({
      tier: standard.tier,
      maxTokens: standard.maxTokens ?? 1200,
      thinking: { type: 'disabled' },
      cacheSystem: true,
      system,
      tools: [tool(standard)],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [
        { role: 'user', content: `Review this ${standard.label} and call ${TOOL_NAME}:\n\n${body}` },
      ],
    })
    void recordAiUsage({
      feature: standard.feature,
      model: MODELS[standard.tier],
      usage: res.usage,
      costUsd: estimateCostUsd(standard.tier, res.usage),
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    return (
      (block ? coerceVerdict(block.input, standard.entity, standard.passScore) : null) ??
      pendingVerdict(standard.entity, [standard.pending.failed])
    )
  } catch {
    // AiUnavailableError or any transient failure: fail closed.
    return pendingVerdict(standard.entity, [standard.pending.failed])
  }
}

// ── The standards catalog (the opt-in) ───────────────────────────────────────────────────

/** The default pass bar. Journeys use it; a stricter entity may raise its own. */
export const DEFAULT_PASS_SCORE = 70

/** The shared budget key every entity except Journeys uses. See lib/ai/budget.ts for the cap. */
export const ENTITY_REVIEW_FEATURE = 'entity-review'

/** The generic fail-closed copy for an entity, built from its name. Plain, no em dashes. */
export function defaultPendingCopy(label: string): PendingCopy {
  const thing = label.toLowerCase()
  return {
    paused: `Vera's read is paused right now, so this ${thing} has not been checked yet. Nothing is lost. Ask for the read again later.`,
    budget: `Vera's read is taking a breather for today. Your ${thing} is untouched. Ask for the read again tomorrow.`,
    failed: `Vera could not finish reading this ${thing}. Nothing changed. Ask for the read again.`,
  }
}

/**
 * The standard any entity gets for free: the voice canon plus the plain test of whether a draft
 * says something specific. Enough to catch generated slop (generic promises, hype, copy that could
 * be about anything), which is the job. An entity that needs a real rubric declares its own above.
 *
 * Sonnet, not Opus, and deliberately: this read judges COPY against a written voice standard, which
 * Sonnet does reliably. The Journey gate stays Opus because it decides rank, a scarce resource
 * people will try to game.
 */
export function defaultStandard(entity: string, label: string): QualityStandard {
  return {
    entity,
    label,
    feature: ENTITY_REVIEW_FEATURE,
    tier: 'sonnet',
    passScore: DEFAULT_PASS_SCORE,
    stakes: `You are deciding whether this is ready for other people to see. It is not a decision about whether it is ALLOWED, only about whether it is good enough yet.`,
    fallbackRubric: `A ${label.toLowerCase()} that is ready to publish:
- Says something SPECIFIC. A reader can tell what this is, who it is for, and what happens. Copy that could describe any other ${label.toLowerCase()} on the internet is not ready.
- Has real substance in every field that matters, not a placeholder or a restated title.
- Sounds like a person, in the Frequency voice: plain words, short sentences, concrete detail, numbers over adjectives. No hype (unlock, elevate, transform, level up), no vibe-verbs (tap into, hold space, lean into), no narrating the reader's feelings, no em dashes.
- Makes no health or medical claims. Health language stays relational (less alone, calmer, steadier), never medical.
- Is honest about time, effort, and cost. If it names a commitment, the commitment is real.`,
    pending: defaultPendingCopy(label),
  }
}

/**
 * Entities with a WRITTEN standard of their own. Keyed by entity id. Anything not listed here
 * still gets a gate through `qualityStandardFor` via the default standard, which is why this map
 * stays short: it holds the entities whose bar is genuinely different, not every entity.
 */
export const QUALITY_STANDARDS: Record<string, QualityStandard> = {
  journey: {
    entity: 'journey',
    label: 'Journey',
    // UNCHANGED from the original gate: same budget key, same Opus tier, same 70 bar, so the
    // ledger, the cap, and rank eligibility all behave exactly as they did before ADR-993.
    feature: 'journey-review',
    tier: 'opus',
    passScore: DEFAULT_PASS_SCORE,
    stakes:
      'Publishing is already open. You are NOT deciding whether it can be shared. You are only deciding whether it is good enough to count toward RANK, which must stay meaningful.',
    rubricFile: 'how-to-create-a-journey.md',
    guidance: `The Master Template the strong Journeys follow: a problem-first premise; a four-week arc, each week with an Anchor practice (a small daily through-line) plus one weekly practice each for Mind, Body, and Spirit that complement the Anchor, a weekly Expression Challenge, and a Reflection; two weekly touchpoints (a Circle Meetup mid-week and a Weekend Gathering on the weekend); and a heavy capstone Expression Challenge at the Close. A Journey need not match it exactly, but coach toward it. A Journey that ignores the standard does not pass, however nice it sounds.

Read it as: approved means the premise names a real shift, the practices range across effort and pillar and could be done on a bad day, and the whole thing could plausibly carry someone for four weeks. Rejected means a vague or hype premise, too few or all-same-weight practices, no daily-doable floor, or nothing that pays off in the first week.`,
    fallbackRubric: `A Journey people finish: a problem-first premise (one line, the shift it creates); five practices tagged Light, Standard, or Heavy, each with a five-minute floor and anchored to a daily routine; a daily loop (a nudge, a tiny action, an instant Zap, visible progress); a capstone that pushes the member to express something. Win the first week. Plain names, no hype.`,
    pending: {
      paused:
        "Vera's review is paused right now, so this isn't counting toward rank yet. Your Journey is still live in the library. Submit it for review again later.",
      budget:
        "Vera's review is taking a breather for today. Your Journey is live in the library. Submit it for review again tomorrow to have it count toward rank.",
      failed:
        "Vera couldn't finish reviewing this one. Your Journey is live in the library. Submit it for review again to count toward rank.",
    },
  },
}

/**
 * The standard for an entity: its declared one, else the generic default built from its label.
 * Total, so any entity can opt in with one call and no new declaration. PURE.
 */
export function qualityStandardFor(entity: string, label?: string): QualityStandard {
  return QUALITY_STANDARDS[entity] ?? defaultStandard(entity, label?.trim() || entity)
}

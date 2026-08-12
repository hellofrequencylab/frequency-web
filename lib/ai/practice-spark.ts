// Vera's "Spark" — the opening step of the guided Practice builder (mirrors lib/ai/journey-spark.ts,
// ADR-358). From a few light answers (who it's for, what the act is, the outcome, how often, how
// long), Vera drafts the WHOLE Practice: a name, a card hook, a one-line description, a full guide
// (the steps), plus the Pillar it fits and a cadence/time suggestion. A Practice is an atom (no
// weekly arc), so unlike the Journey spark this drafts the full content in one pass. Forced-tool
// structured output + the voice + Practice-shape primers + the usage ledger, never trusting the raw
// shape. Degrades to null when AI is off (the wizard then lets the author type it by hand).

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import type { SeedMood } from '@/lib/studio/kernel/moods'
import { withPracticeShape } from './practice-shape'
import { COMPOSE_PILLARS, type ComposePillar } from './journey-composition'

const FEATURE = 'practice-spark'
// Drafting a name, a hook, a one-liner, and a few concrete steps is structured but not deep
// reasoning, so Sonnet clears the quality bar at a fraction of Opus's cost (lib/ai/models.ts:
// "escalate to Opus only deliberately"). The edit path stays on Opus (it reads + rewrites the
// whole Practice), mirroring journey-edit.
const SPARK_TIER = 'sonnet' as const

export type PracticePace = 'light' | 'medium'

export interface PracticeSparkAnswers {
  /** Who the Practice is for. */
  who: string
  /** What the act is — the concrete thing you do. */
  act: string
  /** What people walk away with after doing it for a week. */
  outcome: string
  /** Roughly how often it's done. */
  cadence: PracticeCadenceHint
  /** Roughly how much time one session takes. */
  pace: PracticePace
  /** The MOOD dial (ADR-986): steers TONE only. It never changes what is true, just how it reads. */
  mood?: SeedMood
}

/** The cadence options the wizard offers, kept tight so they line up with the builder's select. */
export type PracticeCadenceHint = 'daily' | 'few-times-week' | 'weekly'

export const CADENCE_LABEL: Record<PracticeCadenceHint, string> = {
  daily: 'Daily',
  'few-times-week': 'A few times a week',
  weekly: 'Weekly',
}

/** The timer half of the draft (ADR-920 Phase 5): how the Practice is DONE. Every field is
 *  re-validated server-side (sanitizeMovementConfig / the builder's clamps) before storage —
 *  Vera proposes, the schema disposes. */
export interface PracticeSparkTimer {
  /** 'mindless' (Be Still), 'movement' (Get Moving), or 'none' (Just Log a real-world act). */
  timerKind: 'mindless' | 'movement' | 'none'
  /** The Be Still flavour, when timerKind is 'mindless'. */
  mindlessMode: 'meditate' | 'breathe' | 'journal' | 'stillness' | 'ritual' | null
  /** The breath pattern slug, when mindlessMode is 'breathe'. */
  breathPattern: 'box' | 'cohere' | 'triangle' | '3x' | '478' | null
  /** The Get Moving shape, when timerKind is 'movement'. */
  movementMode: 'walk' | 'run' | 'yoga' | 'strength' | 'stretch' | null
  /** A short creator warm-up line shown in the pre-roll (<= 140 chars), or null. */
  warmupMessage: string | null
}

export interface PracticeSpark {
  /** Short, plain, concrete name. */
  title: string
  /** The card hook: the problem it solves, pure outcome (<= ~80 chars). */
  summary: string
  /** A one-line description: who it's for + what they notice after a week (<= ~280 chars). */
  description: string
  /** The full guide: a few short, concrete steps in second person, then why + tips. */
  body: string
  /** The Pillar the act fits: 'mind' | 'body' | 'spirit' | 'expression'. Null when unsure. */
  pillar: ComposePillar | null
  /** How often it's done, as a clean label ('Daily' / 'A few times a week' / 'Weekly'). */
  cadence: string
  /** Roughly how many minutes a session takes (null when unsure). */
  durationMin: number | null
  /** How it's DONE: the timer Vera preset (ADR-920 Phase 5). Never null — a draft that
   *  cannot decide falls to a plain 'mindless' sit, matching the old DB default. */
  timer: PracticeSparkTimer
}

const TOOL_NAME = 'draft_practice'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return the whole Practice: a name, a card hook, a one-line description, a full guide, the Pillar it fits, a cadence, and roughly how long a session takes.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short, plain, concrete name (<= 60 chars). The thing you do, not a vibe.' },
      summary: { type: 'string', description: 'The card hook: 8 to 12 words, the problem it solves, pure outcome. For the skeptic.' },
      description: { type: 'string', description: 'A one-line description (~20 to 25 words): who it is for and what they notice after a week. No method.' },
      body: { type: 'string', description: 'The full guide: three to six short, concrete steps in second person, then a line or two on why it helps. Plain markdown.' },
      pillar: { type: 'string', enum: COMPOSE_PILLARS, description: 'The Pillar the act fits: mind, body, spirit, or expression. Omit if genuinely unsure.' },
      cadence: { type: 'string', enum: ['Daily', 'A few times a week', 'Weekly'], description: 'How often it is done.' },
      duration_min: { type: 'integer', description: 'Roughly how many minutes one session takes. Keep the entry version under five.' },
      timer_kind: {
        type: 'string',
        enum: ['mindless', 'movement', 'none'],
        description:
          'How the practice is DONE: "mindless" = a stillness timer (sitting, breathing, journaling); "movement" = a moving timer (walking, running, yoga, stretching, strength); "none" = a real-world act logged after the fact (texting a friend, making the bed).',
      },
      mindless_mode: {
        type: 'string',
        enum: ['meditate', 'breathe', 'journal', 'stillness', 'ritual'],
        description: 'The stillness flavour, ONLY when timer_kind is "mindless".',
      },
      breath_pattern: {
        type: 'string',
        enum: ['box', 'cohere', 'triangle', '3x', '478'],
        description: 'The breathing pattern, ONLY when mindless_mode is "breathe". box = 4-4-4-4, cohere = 5.5 in/out, 478 = 4-7-8 wind-down.',
      },
      movement_mode: {
        type: 'string',
        enum: ['walk', 'run', 'yoga', 'strength', 'stretch'],
        description: 'The movement shape, ONLY when timer_kind is "movement".',
      },
      warmup_message: {
        type: 'string',
        description: 'One short settling line shown before the timer starts (<= 140 chars), e.g. "Find a spot where you can be still." Plain, warm, no hype.',
      },
    },
    required: ['title', 'summary', 'description', 'body', 'timer_kind'],
  },
}

const SYSTEM = `You are Vera, Frequency's guide: warm, grounded, and practical, a camp counselor you actually respect, not a guru and not a hype machine. A member answered a few questions about a Practice they want to build. A Practice is the smallest real thing a person does (sit, breathe, walk, write a line, text one friend), the atom a Journey is built from.

Draft the WHOLE Practice from their answers: a name, a card hook, a one-line description, a full guide (the steps), the Pillar it fits, a cadence, roughly how long a session takes, AND how it is done (the timer): a stillness timer for sitting/breathing/journaling, a moving timer for walks/runs/yoga/stretch/strength, or no timer at all for a real-world act someone logs after the fact. Pick the timer that matches the ACT, and add one short settling warm-up line.

Work backward: the outcome first, then the concrete act that gets there, then the smallest doable version of it. Keep the entry version under five minutes.

How to write:
- Plain language, short sentences. Lead with the problem or the act.
- The guide is three to six short, concrete steps in second person ("Sit down. Set a timer for two minutes."), then a line or two on why it helps. No preamble, no fluff.
- Specific and honest. Never promise transformation. Never narrate the reader's feelings.
- No jargon, no mysticism, no emoji, no em dashes. Never use the word "Mission".
- Always call the ${TOOL_NAME} tool.`

export async function draftPracticeSpark(
  input: PracticeSparkAnswers & { profileId?: string | null; sourceText?: string | null },
): Promise<PracticeSpark | null> {
  if (!aiEnabled()) return null
  // Per-feature daily cap (lib/ai/budget.ts): over budget => fall back to hand-entry, never bill on.
  if (await featureOverBudget(FEATURE)) return null

  // Two modes: structure a Practice the member ALREADY WROTE (sourceText), or draft one from
  // their short answers. The written path preserves their content and only tidies + structures it.
  const written = input.sourceText?.trim().slice(0, 6000) ?? ''
  const userText = written
    ? [
        'The member has ALREADY WRITTEN their Practice below. Do not invent a different one.',
        'Read it and STRUCTURE it into the fields: pull a clean, plain title; write the card hook',
        'and one-line description from it; format what they wrote as the guide (keep their content,',
        'order, and voice, tidy the wording only); and infer the Pillar, a cadence, and roughly how',
        'long a session takes. If something is missing, fill the smallest sensible version.',
        '',
        'Their written Practice:',
        '"""',
        written,
        '"""',
        '',
        `Structure it and call ${TOOL_NAME}.`,
      ].join('\n')
    : [
        `Who it is for: ${input.who.trim().slice(0, 400) || 'anyone'}`,
        `The act (what you do): ${input.act.trim().slice(0, 400) || 'a small daily practice'}`,
        `What they walk away with: ${input.outcome.trim().slice(0, 400) || 'a steadier week'}`,
        `How often: ${CADENCE_LABEL[input.cadence] ?? 'Daily'}`,
        `Time a session: ${input.pace === 'medium' ? 'around 10 to 15 minutes' : 'five minutes or less'}`,
        '',
        `Draft the Practice and call ${TOOL_NAME}.`,
      ].join('\n')

  try {
    const res = await completeRaw({
      tier: SPARK_TIER,
      maxTokens: written ? 1200 : 800,
      thinking: { type: 'disabled' },
      system: withVoice(withPracticeShape(SYSTEM), input.mood),
      tools: [TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    void recordAiUsage({
      feature: FEATURE,
      model: MODELS[SPARK_TIER],
      usage: res.usage,
      costUsd: estimateCostUsd(SPARK_TIER, res.usage),
      profileId: input.profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    return block ? coerce(block.input) : null
  } catch {
    return null
  }
}

function coerce(raw: unknown): PracticeSpark | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 80) : ''
  const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 140) : ''
  const description = typeof r.description === 'string' ? r.description.trim().slice(0, 280) : ''
  const body = typeof r.body === 'string' ? r.body.trim().slice(0, 8000) : ''
  if (!title) return null

  const pillarRaw = typeof r.pillar === 'string' ? r.pillar.trim().toLowerCase() : ''
  const pillar = COMPOSE_PILLARS.includes(pillarRaw as ComposePillar) ? (pillarRaw as ComposePillar) : null

  const cadenceRaw = typeof r.cadence === 'string' ? r.cadence.trim() : ''
  const cadence = ['Daily', 'A few times a week', 'Weekly'].includes(cadenceRaw) ? cadenceRaw : 'Daily'

  const dm =
    typeof r.duration_min === 'number' && Number.isFinite(r.duration_min)
      ? Math.max(1, Math.min(600, Math.floor(r.duration_min)))
      : null

  return { title, summary, description, body, pillar, cadence, durationMin: dm, timer: coerceTimer(r) }
}

/** Narrow the timer half against the REAL enums (never trust the raw shape). Anything off the
 *  list falls to the safe default: a plain mindless sit — exactly the old DB default, so a
 *  degraded draft is never worse than the pre-ADR-920 behavior. */
function coerceTimer(r: Record<string, unknown>): PracticeSparkTimer {
  const kindRaw = typeof r.timer_kind === 'string' ? r.timer_kind : 'mindless'
  const timerKind = (['mindless', 'movement', 'none'] as const).find((k) => k === kindRaw) ?? 'mindless'
  const modeRaw = typeof r.mindless_mode === 'string' ? r.mindless_mode : ''
  const mindlessMode =
    timerKind === 'mindless'
      ? (['meditate', 'breathe', 'journal', 'stillness', 'ritual'] as const).find((m) => m === modeRaw) ?? null
      : null
  const patternRaw = typeof r.breath_pattern === 'string' ? r.breath_pattern : ''
  const breathPattern =
    mindlessMode === 'breathe'
      ? (['box', 'cohere', 'triangle', '3x', '478'] as const).find((p) => p === patternRaw) ?? null
      : null
  const moveRaw = typeof r.movement_mode === 'string' ? r.movement_mode : ''
  const movementMode =
    timerKind === 'movement'
      ? (['walk', 'run', 'yoga', 'strength', 'stretch'] as const).find((m) => m === moveRaw) ?? 'walk'
      : null
  const warmupMessage =
    typeof r.warmup_message === 'string' && r.warmup_message.trim() ? r.warmup_message.trim().slice(0, 140) : null
  return { timerKind, mindlessMode, breathPattern, movementMode, warmupMessage }
}

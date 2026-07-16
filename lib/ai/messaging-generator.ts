// The guided messaging generator (Resonance CRM, Phase 1). Vera turns a few plain answers from the
// /admin/marketing/messaging/new wizard into a REVIEWABLE DRAFT: either one campaign email (subject +
// preheader + a block-editor body) or a multi-step email sequence (N steps, each with a delay + a body).
//
// The output is the SAME structured email-block layout the composer / editor already renders: an
// EntityLayout (kind 'email') compiled by lib/email-studio (compileEmailDoc), with merge tags
// ({{contact.first_name}}) where sensible, so a generated draft drops straight into the existing editor
// and sends through the SAME gated pipeline later. This module NEVER sends: it produces data the caller
// persists as a DRAFT.
//
// Mirrors the established forced-tool pattern (lib/ai/circle-compose.ts): withVoice + a forced tool for
// structured output + the usage ledger + a per-feature budget cap, and a total fail-safe (AI off / over
// budget / a bad shape / a throw all return null so the caller shows a friendly error and saves nothing).
//
// KEY SAFETY CHOICE: the model returns SIMPLE copy fields (subject, preheader, a headline, body paragraphs,
// an optional CTA), NEVER raw EntityLayout JSON. We assemble the block layout DETERMINISTICALLY from those
// fields (buildEmailDoc) and re-run it through sanitizeEntityLayout('email'), so the body is always a valid,
// safe, compileEmailDoc-compatible document no matter what the model emits.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import { stripEmDashes } from './space-copilot'
import {
  sanitizeEntityLayout,
  starterRows,
  type EntityLayout,
} from '@/lib/entity-blocks/layout'
import type { EmailDoc } from '@/lib/email-studio/types'

const FEATURE = 'messaging-generator'
const TIER = 'sonnet' as const

/** How many emails a generated sequence may hold (bounds the model + the persisted drafts). */
export const MIN_SEQUENCE_STEPS = 2
export const MAX_SEQUENCE_STEPS = 6

// ── Public shapes ────────────────────────────────────────────────────────────────────────────────────

/** The plain, model-authored copy for ONE email, BEFORE it is assembled into a block layout. Pure data. */
export interface DraftEmailContent {
  subject: string
  preheader: string
  /** The in-body opening headline (the Heading block). */
  headline: string
  /** The body paragraphs (each becomes a line in the Text block). At least one is required. */
  body: string[]
  /** An optional call-to-action button. Present only when a real next step exists. */
  ctaLabel?: string
  ctaUrl?: string
}

/** A generated single-email draft: the subject + preheader + the block-editor body (EntityLayout). Exactly
 *  the EmailDoc shape the composer edits and compileEmailDoc renders. */
export type GeneratedEmail = EmailDoc

/** One step of a generated sequence: the email plus its place + cadence. `delayHours` is the delay AFTER the
 *  previous step (0 for the first). `stepLabel` is a short name for the step (e.g. "Welcome"). */
export interface GeneratedSequenceStep extends GeneratedEmail {
  stepLabel: string
  delayHours: number
}

export interface GeneratedSequence {
  steps: GeneratedSequenceStep[]
}

/** The wizard's answers, grounding the generation. */
export interface GenerateMessagingInput {
  goalKey: string
  goalLabel: string
  object: 'campaign' | 'funnel'
  /** One line on what this is for (the goal's blurb). */
  intent: string
  /** A plain audience label (e.g. "All members"), for grounding only. */
  audience: string
  /** The operator's chosen tone key (warm / plain / upbeat). */
  tone: string
  /** The operator's name for the campaign / series. */
  name: string
  /** Anything the operator added in their own words. Optional. */
  details?: string
  /** The best-practice outline for a sequence goal (title + timing + note per step). */
  outline?: readonly { title: string; timing: string; note: string }[]
  /** How many steps a sequence should have (clamped to [MIN, MAX]). Defaults to the outline length. */
  stepCount?: number
  profileId?: string | null
}

// ── Pure assembly (model copy → a valid EntityLayout email doc) ────────────────────────────────────────

/** A short plain-language tone note for the prompt. */
const TONE_NOTE: Record<string, string> = {
  warm: 'Warm and personal, like a friend confirming plans.',
  plain: 'Plain and direct. Say the thing, no throat-clearing.',
  upbeat: 'Upbeat and energetic, but never salesy or hyped.',
}

const MAX_HEADLINE = 120
const MAX_PARAGRAPH = 600
const MAX_PARAGRAPHS = 6
const MAX_LABEL = 60

function cleanLine(v: unknown, max: number): string {
  return typeof v === 'string' ? stripEmDashes(v).replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function cleanParagraph(v: unknown, max: number): string {
  return typeof v === 'string' ? stripEmDashes(v).replace(/[ \t]+/g, ' ').trim().slice(0, max) : ''
}

/**
 * Assemble one email's block-editor body from plain copy fields. DETERMINISTIC + total: builds a single
 * vertical column of real email-palette blocks (Heading, Text, and a Button when a CTA exists), then runs the
 * whole thing through sanitizeEntityLayout('email') so the result is guaranteed valid + safe (the same guard
 * every composer save runs). The body paragraphs are joined with blank lines; the email renderer turns the
 * newlines into <br> breaks. Returns the full EmailDoc (subject + preheader + layout). Pure.
 */
export function buildEmailDoc(content: DraftEmailContent): GeneratedEmail {
  const headline = cleanLine(content.headline, MAX_HEADLINE)
  const paragraphs = (Array.isArray(content.body) ? content.body : [])
    .map((p) => cleanParagraph(p, MAX_PARAGRAPH))
    .filter(Boolean)
    .slice(0, MAX_PARAGRAPHS)
  const ctaLabel = cleanLine(content.ctaLabel, MAX_LABEL)
  const ctaUrl = typeof content.ctaUrl === 'string' ? content.ctaUrl.trim().slice(0, 400) : ''

  const rows: EntityLayout['rows'] = [
    { id: 'r0', columns: 1, cells: [['heading']] },
    { id: 'r1', columns: 1, cells: [['text']] },
  ]
  const contentMap: Record<string, Record<string, unknown>> = {
    heading: { text: headline },
    text: { text: paragraphs.join('\n\n') },
  }
  if (ctaLabel) {
    rows.push({ id: 'r2', columns: 1, cells: [['button']] })
    // `url` runs through safeUrl on sanitize; a blank / unsafe link is dropped and the operator fills it in
    // the editor (the button still renders with its label). Alignment centered for a marketing CTA.
    contentMap.button = { label: ctaLabel, url: ctaUrl, align: 'center' }
  }

  const raw: EntityLayout = { rows, content: contentMap }
  const layout = sanitizeEntityLayout(raw, 'email') ?? { rows: starterRows('email', 'basic') }
  return {
    subject: cleanLine(content.subject, 300),
    preheader: cleanLine(content.preheader, 300),
    layout,
  }
}

// ── Coerce (never trust the raw model shape) ───────────────────────────────────────────────────────────

/** Parse one email's copy fields out of a raw tool input, or null when there is nothing usable (no headline
 *  and no body). Total + fail-safe: every field is coerced, trimmed, em-dash-stripped, and bounded. */
export function coerceEmailContent(raw: unknown): DraftEmailContent | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const headline = cleanLine(r.headline, MAX_HEADLINE)
  const body = (Array.isArray(r.body) ? r.body : [])
    .map((p) => cleanParagraph(p, MAX_PARAGRAPH))
    .filter(Boolean)
    .slice(0, MAX_PARAGRAPHS)
  // A usable email needs at least a headline and one paragraph; otherwise the draft would be empty.
  if (!headline || body.length === 0) return null
  const out: DraftEmailContent = {
    subject: cleanLine(r.subject, 300) || headline,
    preheader: cleanLine(r.preheader, 300),
    headline,
    body,
  }
  const ctaLabel = cleanLine(r.cta_label, MAX_LABEL)
  if (ctaLabel) {
    out.ctaLabel = ctaLabel
    const url = typeof r.cta_url === 'string' ? r.cta_url.trim().slice(0, 400) : ''
    if (url) out.ctaUrl = url
  }
  return out
}

function clampStepCount(n: number | undefined, outlineLen: number): number {
  const base = Number.isFinite(n) && (n as number) > 0 ? Math.round(n as number) : outlineLen || 4
  return Math.max(MIN_SEQUENCE_STEPS, Math.min(MAX_SEQUENCE_STEPS, base))
}

/** Parse a whole sequence out of a raw tool input, or null when no step survives. Clamps to [MIN, MAX] steps,
 *  coerces each email, and reads each step's label + delay (the first step's delay is forced to 0). Total. */
export function coerceSequence(raw: unknown, maxSteps: number): GeneratedSequence | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const emails = Array.isArray(r.emails) ? r.emails : []
  const steps: GeneratedSequenceStep[] = []
  for (const e of emails.slice(0, Math.max(MIN_SEQUENCE_STEPS, Math.min(MAX_SEQUENCE_STEPS, maxSteps)))) {
    const content = coerceEmailContent(e)
    if (!content) continue
    const eo = e as Record<string, unknown>
    const doc = buildEmailDoc(content)
    const delayRaw = typeof eo.delay_hours === 'number' && Number.isFinite(eo.delay_hours) ? eo.delay_hours : 0
    steps.push({
      ...doc,
      stepLabel: cleanLine(eo.step_label, MAX_LABEL) || content.headline.slice(0, MAX_LABEL),
      // First step goes out on enrollment (0); others carry a non-negative, whole-hour delay.
      delayHours: steps.length === 0 ? 0 : Math.max(0, Math.round(delayRaw)),
    })
  }
  return steps.length ? { steps } : null
}

// ── Prompt + tools ──────────────────────────────────────────────────────────────────────────────────

const SYSTEM = `You are Vera, Frequency's guide, drafting marketing email for an operator to review and edit. Frequency is community infrastructure for real-world connection: Circles, the Quest, in-person gatherings. The reader is a member or a lead.

Write the copy the operator asked for, grounded ONLY in the answers you are given. Rules:
- One clear idea per email, and one call to action. Lead with the point; people skim.
- Open the body with a short greeting that uses the merge tag {{contact.first_name}} exactly (it fills in the recipient's name, falling back to "there"). Use it only in the greeting, never more than once.
- Keep each email short: a headline, two or three plain paragraphs, and (when there is a genuine next step) a CTA button with a label. Only include a CTA URL if you were given one; otherwise leave it blank for the operator to fill.
- Never invent a fact, a date, a name, a statistic, an event, or a link you were not given.
- Voice: plain, warm, a little dry. Proper nouns carry the magic; the sentences stay plain. No hype, no guilt, no fake urgency, no emoji, no em dashes.
- Subjects are short and specific (aim under 55 characters). The preheader is one line that adds to the subject, never repeats it.
Always answer by calling the provided tool. Put NOTHING outside the tool call.`

/** The shared per-email field shape both tools use (a campaign is one email; a sequence is a list of them). */
const EMAIL_FIELDS = {
  subject: { type: 'string', description: 'The subject line. Short and specific, under ~55 characters.' },
  preheader: { type: 'string', description: 'One line of inbox preview text that adds to the subject.' },
  headline: { type: 'string', description: 'The in-body opening headline.' },
  body: {
    type: 'array',
    items: { type: 'string' },
    description: 'Two or three short paragraphs. The FIRST starts with a greeting using {{contact.first_name}}.',
  },
  cta_label: { type: 'string', description: 'The call-to-action button label, e.g. "Find a Circle". Omit when there is no clear next step.' },
  cta_url: { type: 'string', description: 'The CTA link. Include ONLY if a URL was provided; otherwise leave blank.' },
} as const

const CAMPAIGN_TOOL_NAME = 'draft_campaign_email'
const CAMPAIGN_TOOL: Anthropic.Tool = {
  name: CAMPAIGN_TOOL_NAME,
  description: 'Return one campaign email: subject, preheader, headline, body paragraphs, and an optional CTA.',
  input_schema: {
    type: 'object',
    properties: EMAIL_FIELDS as unknown as Anthropic.Tool.InputSchema['properties'],
    required: ['subject', 'headline', 'body'],
  },
}

const SEQUENCE_TOOL_NAME = 'draft_email_sequence'
const SEQUENCE_TOOL: Anthropic.Tool = {
  name: SEQUENCE_TOOL_NAME,
  description: 'Return an ordered list of emails for a multi-step series. Each email is one step, with a delay after the previous one.',
  input_schema: {
    type: 'object',
    properties: {
      emails: {
        type: 'array',
        description: 'The emails in send order, one per step.',
        items: {
          type: 'object',
          properties: {
            step_label: { type: 'string', description: 'A short name for this step, e.g. "Welcome" or "First practice".' },
            delay_hours: { type: 'number', description: 'Whole hours to wait AFTER the previous email. Use 0 for the first email.' },
            ...(EMAIL_FIELDS as Record<string, unknown>),
          },
          required: ['subject', 'headline', 'body'],
        },
      },
    },
    required: ['emails'],
  },
}

// ── Grounding text ────────────────────────────────────────────────────────────────────────────────────

function toneNote(tone: string): string {
  return TONE_NOTE[tone] ?? TONE_NOTE.warm
}

function baseContext(input: GenerateMessagingInput): string[] {
  return [
    `Goal: ${input.goalLabel} (${input.intent}).`,
    `Name: ${input.name.trim().slice(0, 160) || '(unnamed)'}.`,
    `Audience: ${input.audience.trim().slice(0, 160) || 'Frequency members'}.`,
    `Tone: ${toneNote(input.tone)}`,
    input.details ? `The operator added: ${input.details.trim().slice(0, 600)}` : '',
  ].filter(Boolean)
}

// ── Generation ────────────────────────────────────────────────────────────────────────────────────────

/** Guard both entry points share: AI on AND under the daily cap. */
async function canGenerate(): Promise<boolean> {
  if (!aiEnabled()) return false
  if (await featureOverBudget(FEATURE)) return false
  return true
}

/**
 * Generate ONE campaign email draft, or null when AI is off / over budget / the model returns nothing usable.
 * Never sends: it returns an EmailDoc the caller persists as a draft. Fail-safe (any throw returns null).
 */
export async function generateCampaignDraft(input: GenerateMessagingInput): Promise<GeneratedEmail | null> {
  if (!(await canGenerate())) return null

  const userText = [
    ...baseContext(input),
    '',
    `Write ONE campaign email for this audience. Call ${CAMPAIGN_TOOL_NAME}.`,
  ].join('\n')

  try {
    const res = await completeRaw({
      tier: TIER,
      maxTokens: 900,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [CAMPAIGN_TOOL],
      toolChoice: { type: 'tool', name: CAMPAIGN_TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    void recordAiUsage({
      feature: FEATURE,
      model: MODELS[TIER],
      usage: res.usage,
      costUsd: estimateCostUsd(TIER, res.usage),
      profileId: input.profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === CAMPAIGN_TOOL_NAME,
    )
    const content = block ? coerceEmailContent(block.input) : null
    return content ? buildEmailDoc(content) : null
  } catch {
    return null
  }
}

/**
 * Generate a multi-step email sequence draft, or null when AI is off / over budget / the model returns
 * nothing usable. Never sends: it returns the ordered step docs the caller persists as drafts. Fail-safe.
 */
export async function generateSequenceDraft(input: GenerateMessagingInput): Promise<GeneratedSequence | null> {
  if (!(await canGenerate())) return null

  const stepCount = clampStepCount(input.stepCount, input.outline?.length ?? 0)
  const outlineText = (input.outline ?? [])
    .slice(0, stepCount)
    .map((s, i) => `${i + 1}. ${s.title} (${s.timing}): ${s.note}`)
    .join('\n')

  const userText = [
    ...baseContext(input),
    '',
    `Write a ${stepCount}-email series. Follow this best-practice outline for the order and timing:`,
    outlineText || `(${stepCount} steps, spaced a few days apart. The first goes out on signup.)`,
    '',
    `Return exactly ${stepCount} emails in send order. Call ${SEQUENCE_TOOL_NAME}.`,
  ].join('\n')

  try {
    const res = await completeRaw({
      tier: TIER,
      maxTokens: 2400,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [SEQUENCE_TOOL],
      toolChoice: { type: 'tool', name: SEQUENCE_TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    void recordAiUsage({
      feature: FEATURE,
      model: MODELS[TIER],
      usage: res.usage,
      costUsd: estimateCostUsd(TIER, res.usage),
      profileId: input.profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === SEQUENCE_TOOL_NAME,
    )
    return block ? coerceSequence(block.input, stepCount) : null
  } catch {
    return null
  }
}

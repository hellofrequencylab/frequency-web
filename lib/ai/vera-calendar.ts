// VERA AT THE CALENDAR (PROG-CAL10, ADR-1386 P6 invariants). A plain-words ask ("pencil a sound bath
// on every new moon this winter") becomes a LIST OF PROPOSED CHANGES in the closed vocabulary of
// lib/calendar/vera-command.ts. Nothing here writes a row: the action that calls this returns the
// proposal to the box, a person ticks the lines, and only `applyVeraChanges` (on the caller's own
// session) touches the calendar. Vera never publishes, sends or books on her own.
//
// Three tools, one bounded loop (at most MAX_ROUNDS model calls per ask):
//   lunar_dates        the model MAY call this first. The server computes the days with
//                      lib/calendar/moon.ts (Meeus) in the Space's zone and feeds them back, so
//                      "every new moon" is arithmetic, never a recollection.
//   ask_clarification  the model calls this INSTEAD of proposing when the ask is ambiguous in a
//                      way that changes the outcome (PROG-CAL11 slice 1). The server does not loop
//                      again: the question goes back to the box with the TRANSCRIPT so far, the
//                      person answers, and the next call continues the same conversation. At most
//                      MAX_CLARIFICATIONS questions per ask; after that the tool is withheld and
//                      the model has to propose or say it could not.
//   propose_changes    the model MUST end with this. Its input is the change vocabulary, parsed
//                      strictly by parseVeraChanges; anything off-shape is refused as an honest error.
//
// THE TRANSCRIPT IS SESSION-ONLY. It is the API messages array (the ask, then the assistant
// tool_use turns and the user tool_result turns), held in the box's state and sent back with the
// answer. It is never stored anywhere, and it is untrusted on the way back: `parseVeraTranscript`
// checks its shape and size before it is sent to the model. The first message carries only the
// ASK; the Space context is rebuilt fresh on every call and prepended on the server, so a
// continuation sees today's calendar and the transcript stays small.
//
// Context is THIS Space only: the visible window's dates and its Plans, by id, title, day and stage.
// No other Space's data reaches the prompt (ADR-1386 P6). Usage lands in the ledger under one
// feature key with the Space attributed, behind the daily caps and the per-actor window like every
// other AI door.

import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { aiEnabled } from './client'
import { completeRaw, type CompleteMessage } from './complete'
import { MODELS } from './models'
import { addUsage, estimateCostUsd, type TokenUsage } from './budget'
import { featureOverBudget, recordAiUsage } from './usage'
import { aiRateLimited } from './rate-limit'
import { withVoice } from './voice'
import { lunarPhaseDates, type LunarPhase } from '@/lib/calendar/moon'
import {
  MAX_CLARIFICATION_OPTIONS,
  MAX_PENCIL_DAYS,
  MAX_VERA_CHANGES,
  MIN_CLARIFICATION_OPTIONS,
  parseVeraChanges,
  parseVeraClarification,
  stageLabel,
  VERA_STAGES,
  type VeraChange,
  type VeraClarificationOption,
  type VeraMode,
} from '@/lib/calendar/vera-command'

export const VERA_CALENDAR_FEATURE = 'vera-calendar'
/** The most model calls one ask may spend: a lunar lookup, a second lookup, the proposal. */
export const MAX_ROUNDS = 3
/** The most questions Vera may ask per request before she has to propose or say she cannot. */
export const MAX_CLARIFICATIONS = 2
/** The transcript a continuation may carry back: messages and bytes. Two questions, each with a
 *  lunar lookup before it, is nine messages; the ceilings leave room and no more. */
export const MAX_TRANSCRIPT_MESSAGES = 12
export const MAX_TRANSCRIPT_BYTES = 24 * 1024
const MAX_ASK = 600
const MAX_ANSWER = 600
const MAX_CONTEXT_ROWS = 120
const MAX_LUNAR_SPAN_DAYS = 400

export const LUNAR_TOOL_NAME = 'lunar_dates'
export const CLARIFY_TOOL_NAME = 'ask_clarification'
export const PROPOSE_TOOL_NAME = 'propose_changes'

/** What the box sends and the action fills in. Every field is this Space's or the viewer's. */
export interface VeraCalendarContext {
  spaceId: string
  timeZone: string
  /** YYYY-MM-DD in the Space's zone. */
  today: string
  /** The dates in the window the operator is looking at. */
  entries: { id: string; title: string; day: string; stage: string | null; planId: string | null }[]
  plans: { id: string; title: string; stage: string }[]
  profileId?: string | null
}

/** The conversation so far, in the API messages shape, with the first message carrying only the
 *  ask. Session-only: it lives in the box's state and is never written anywhere. */
export type VeraTranscript = CompleteMessage[]

export type VeraCalendarReply =
  | {
      kind: 'proposal'
      changes: VeraChange[]
      /** One plain line from Vera about what she proposed and what she was not sure of. */
      note: string
    }
  | {
      kind: 'clarification'
      question: string
      options: VeraClarificationOption[]
      allowFreeText: boolean
      /** What the box sends back with the answer so the next call continues this conversation. */
      transcript: VeraTranscript
    }

const LUNAR_TOOL: Anthropic.Tool = {
  name: LUNAR_TOOL_NAME,
  description:
    'The calendar days a moon phase falls on, in the Space time zone, computed by the server. Call this before proposing anything that mentions a new moon or a full moon; never estimate those dates yourself.',
  input_schema: {
    type: 'object',
    properties: {
      phase: { type: 'string', enum: ['new', 'full'], description: 'Which phase.' },
      fromDay: { type: 'string', description: 'First day of the range, YYYY-MM-DD.' },
      toDay: { type: 'string', description: 'Last day of the range, inclusive, YYYY-MM-DD. At most about a year after fromDay.' },
    },
    required: ['phase', 'fromDay', 'toDay'],
  },
}

const CLARIFY_TOOL: Anthropic.Tool = {
  name: CLARIFY_TOOL_NAME,
  description:
    'Ask the person ONE question before proposing, only when the request is ambiguous in a way that changes the outcome: several Plans or dates in the context match what they named, a timed thing has no time, or a day could fall in two different years. Offer the candidates as options. Never call this when a sensible default exists; assume the default and say so in the note of propose_changes instead.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'One plain question, at most 200 characters. No long dashes, no exclamation marks.' },
      options: {
        type: 'array',
        description: `${MIN_CLARIFICATION_OPTIONS} to ${MAX_CLARIFICATION_OPTIONS} answers the person can pick, drawn from the context.`,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'What the person sees, at most 60 characters: a Plan title with its date, a time, a year.' },
            value: { type: 'string', description: 'What comes back as the answer, at most 120 characters: the Plan or date id from the context when the option is one, otherwise a short plain value.' },
          },
          required: ['label', 'value'],
        },
      },
      allowFreeText: { type: 'boolean', description: 'true when a typed answer none of the options cover would help (a time, a title). Default false.' },
    },
    required: ['question', 'options'],
  },
}

const PROPOSE_TOOL: Anthropic.Tool = {
  name: PROPOSE_TOOL_NAME,
  description:
    'Answer with the list of proposed calendar changes. Nothing is applied by this call: a person reviews each line and accepts or discards it.',
  input_schema: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        description: `The proposed changes, in the order they should be applied. At most ${MAX_VERA_CHANGES}.`,
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['pencil', 'move', 'stage', 'retitle', 'todo', 'archive'],
              description:
                'pencil: put a titled date (or many dates of one Plan) on the calendar. move: move one existing date to another day. stage: set a Plan and its dates to a stage. retitle: rename a Plan. todo: add a to-do to a Plan. archive: put a Plan away.',
            },
            title: { type: 'string', description: 'pencil / retitle / todo: the title. Plain, sentence case, no long dashes.' },
            days: {
              type: 'array',
              items: { type: 'string' },
              description: `pencil: every day, YYYY-MM-DD in the Space zone. One Plan holds many dates, so a repeating thing is ONE pencil change with many days (at most ${MAX_PENCIL_DAYS}).`,
            },
            startTime: { type: 'string', description: 'pencil: HH:MM, 24 hour, in the Space zone. Omit with endTime for all day.' },
            endTime: { type: 'string', description: 'pencil: HH:MM, 24 hour. Omit with startTime for all day.' },
            timeZone: { type: 'string', description: 'pencil: the Space time zone exactly as given in the context.' },
            planId: { type: 'string', description: 'pencil: an EXISTING Plan id from the context to add the dates to; omit to start a new Plan. stage / retitle / todo / archive: the Plan id from the context.' },
            stage: {
              type: 'string',
              enum: [...VERA_STAGES],
              description: 'stage: the stage to set (pencil, plan, production, cancelled). pencil: the stage a NEW Plan starts in (pencil, plan or production); use the mode the person chose unless they said otherwise.',
            },
            entryId: { type: 'string', description: 'move: the id of the date to move, from the context.' },
            toDay: { type: 'string', description: 'move: the day to move it to, YYYY-MM-DD.' },
            dueOffsetDays: { type: 'integer', description: 'todo: days relative to the Plan date; negative means before. Omit for no due date.' },
          },
          required: ['kind'],
        },
      },
      note: {
        type: 'string',
        description: 'One or two plain sentences for the person: what you proposed and anything you had to assume. No long dashes, no exclamation marks.',
      },
    },
    required: ['changes', 'note'],
  },
}

const SYSTEM_STABLE = `You are Vera, helping a Space team work its private calendar. The team is in the Pencil, Planning, Production lifecycle: a Pencil is a tentative private date, Planning means the date is decided and the team is putting it together, Production means it is ready to run, and Cancelled is the exit. A Plan is the working record that holds one or MANY dates.

What you do here is turn a plain request into a list of proposed changes and nothing else.

Rules that never bend:
- You never publish, send, book or apply anything. Every change you return is a proposal a person reviews line by line and accepts or discards. Say so in the note only if it helps.
- Only this Space's calendar exists. Use only the ids given in the context; never invent an id. If the request names something that is not in the context, leave it out and say so in the note.
- Dates of the moon are computed, never guessed: call ${LUNAR_TOOL_NAME} first, then propose with the days it returns.
- A repeating thing on one Plan is ONE pencil change with many days, not many changes.
- Resolve relative words ("this winter", "next month", "the second Saturday") against today's date and the Space time zone given in the context, and write every day as YYYY-MM-DD.
- Keep titles plain and in sentence case. No long dashes anywhere. No exclamation marks.
- If the request cannot be expressed with the six kinds of change, propose what can be and say what could not in the note.
- When the request is ambiguous in a way that changes the outcome (several Plans or dates in the context match what was named, a timed thing has no time, a day could fall in two years), call ${CLARIFY_TOOL_NAME} INSTEAD of ${PROPOSE_TOOL_NAME}: one plain question, ${MIN_CLARIFICATION_OPTIONS} to ${MAX_CLARIFICATION_OPTIONS} options drawn from the context, with the id as the value where one exists. Never ask when a sensible default exists; take the default and say so in the note. At most ${MAX_CLARIFICATIONS} questions per request; once they are spent, propose with the best reading.
- The answer to a question comes back as that tool's result. Continue from it; do not ask the same thing again.
- Always answer by calling ${PROPOSE_TOOL_NAME} or ${CLARIFY_TOOL_NAME}. Do not answer in prose.`

function contextText(ctx: VeraCalendarContext, mode: VeraMode): string {
  const lines: string[] = [
    `Today: ${ctx.today}`,
    `Space time zone: ${ctx.timeZone}`,
    `Mode the person chose (the stage new things start in): ${stageLabel(mode)} (value "${mode}")`,
    '',
    `Plans (${Math.min(ctx.plans.length, MAX_CONTEXT_ROWS)} of ${ctx.plans.length}):`,
  ]
  for (const p of ctx.plans.slice(0, MAX_CONTEXT_ROWS)) lines.push(`- [${p.id}] ${p.title} (${stageLabel(p.stage)})`)
  if (ctx.plans.length === 0) lines.push('- none yet')
  lines.push('', `Dates in view (${Math.min(ctx.entries.length, MAX_CONTEXT_ROWS)} of ${ctx.entries.length}):`)
  for (const e of ctx.entries.slice(0, MAX_CONTEXT_ROWS)) {
    lines.push(`- [${e.id}] ${e.day} ${e.title}${e.stage ? ` (${stageLabel(e.stage === 'planning' ? 'plan' : e.stage)})` : ''}${e.planId ? ` plan:${e.planId}` : ''}`)
  }
  if (ctx.entries.length === 0) lines.push('- none in this window')
  return lines.join('\n')
}

function clampDay(day: unknown): string | null {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** Execute the lunar tool for the model. A bad range is answered with an error result so the model
 *  can ask again, never with a guess. */
export function runLunarTool(input: Record<string, unknown>, timeZone: string): { ok: true; days: string[] } | { ok: false; error: string } {
  const phase = input.phase === 'new' || input.phase === 'full' ? (input.phase as LunarPhase) : null
  const fromDay = clampDay(input.fromDay)
  const toDay = clampDay(input.toDay)
  if (!phase || !fromDay || !toDay) return { ok: false, error: 'phase must be new or full, and fromDay and toDay must be YYYY-MM-DD.' }
  const span = (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000
  if (!Number.isFinite(span) || span < 0) return { ok: false, error: 'toDay is before fromDay.' }
  if (span > MAX_LUNAR_SPAN_DAYS) return { ok: false, error: `Ask for at most ${MAX_LUNAR_SPAN_DAYS} days at a time.` }
  return { ok: true, days: lunarPhaseDates(phase, fromDay, toDay, timeZone) }
}

export type ProposeCalendarChangesResult = VeraCalendarReply | { error: string }

const TRANSCRIPT_BLOCK_TYPES = new Set(['text', 'tool_use', 'tool_result'])
const TRANSCRIPT_ERROR = 'That conversation with Vera could not be picked up again. Start over and ask afresh.'

function isTranscriptBlock(b: unknown): boolean {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return false
  const o = b as Record<string, unknown>
  if (typeof o.type !== 'string' || !TRANSCRIPT_BLOCK_TYPES.has(o.type)) return false
  if (o.type === 'text') return typeof o.text === 'string'
  if (o.type === 'tool_use') return typeof o.id === 'string' && typeof o.name === 'string' && !!o.input && typeof o.input === 'object'
  return typeof o.tool_use_id === 'string' && (typeof o.content === 'string' || Array.isArray(o.content))
}

/**
 * Check a transcript that came back from the browser: an array of at most MAX_TRANSCRIPT_MESSAGES
 * messages, at most MAX_TRANSCRIPT_BYTES as JSON, roles strictly alternating from a user message
 * whose content is the ask as a plain string, every later content a string or a list of text,
 * tool_use and tool_result blocks, and the last message an assistant turn (so an answer can
 * follow it). Anything else is refused with one honest sentence; nothing is repaired.
 */
export function parseVeraTranscript(raw: unknown): { transcript: VeraTranscript } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: TRANSCRIPT_ERROR }
  if (raw.length > MAX_TRANSCRIPT_MESSAGES) return { error: TRANSCRIPT_ERROR }
  let bytes = 0
  try {
    bytes = Buffer.byteLength(JSON.stringify(raw), 'utf8')
  } catch {
    return { error: TRANSCRIPT_ERROR }
  }
  if (bytes > MAX_TRANSCRIPT_BYTES) return { error: TRANSCRIPT_ERROR }
  const transcript: VeraTranscript = []
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i]
    if (!m || typeof m !== 'object' || Array.isArray(m)) return { error: TRANSCRIPT_ERROR }
    const { role, content } = m as { role?: unknown; content?: unknown }
    const expected = i % 2 === 0 ? 'user' : 'assistant'
    if (role !== expected) return { error: TRANSCRIPT_ERROR }
    if (i === 0) {
      if (typeof content !== 'string' || !content.trim() || content.length > MAX_ASK) return { error: TRANSCRIPT_ERROR }
    } else if (typeof content !== 'string') {
      if (!Array.isArray(content) || content.length === 0 || !content.every(isTranscriptBlock)) return { error: TRANSCRIPT_ERROR }
    }
    transcript.push({ role: expected, content: content as CompleteMessage['content'] })
  }
  if (transcript[transcript.length - 1].role !== 'assistant') return { error: TRANSCRIPT_ERROR }
  return { transcript }
}

function toolUsesOf(content: CompleteMessage['content']): Anthropic.ToolUseBlockParam[] {
  if (typeof content === 'string') return []
  return content.filter((b): b is Anthropic.ToolUseBlockParam => (b as { type?: string }).type === 'tool_use')
}

/** How many questions the transcript already holds. */
function clarificationsIn(transcript: VeraTranscript): number {
  let n = 0
  for (const m of transcript) if (m.role === 'assistant') n += toolUsesOf(m.content).filter((b) => b.name === CLARIFY_TOOL_NAME).length
  return n
}

function cleanNote(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[\u2013\u2014]/g, ',').replace(/!/g, '.').replace(/\s+/g, ' ').trim().slice(0, 400) : ''
}

/**
 * The plain-words ask, as a proposal or a question. Honest errors, never a silent empty list: the
 * box shows the sentence that comes back, whether it is "Vera is switched off here" or "that was
 * more than 40 changes", so a person always knows why nothing was proposed.
 *
 * A first call carries the ask alone. A continuation carries the `transcript` the last reply
 * returned and the person's `answer`; the ask is then read from the transcript's first message
 * and the answer is fed to the model as the result of its own question.
 */
export async function proposeCalendarChanges(input: {
  ask: string
  mode: VeraMode
  context: VeraCalendarContext
  transcript?: VeraTranscript | null
  answer?: string | null
}): Promise<ProposeCalendarChangesResult> {
  if (!aiEnabled()) return { error: 'Vera is switched off here, so nothing can be proposed. Add dates by hand from Pencil it in.' }
  const ctx = input.context
  const prior = input.transcript ?? null
  const ask = (prior ? String(prior[0].content) : input.ask).replace(/\s+/g, ' ').trim().slice(0, MAX_ASK)
  if (!ask) return { error: 'Say what should happen on the calendar, and when.' }

  // A continuation answers the LAST question in the transcript, by its tool_use id. A transcript
  // that does not end on a question has nothing to answer, so it is refused rather than guessed at.
  let answerResult: Anthropic.ToolResultBlockParam | null = null
  if (prior) {
    const answer = typeof input.answer === 'string' ? input.answer.replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER) : ''
    if (!answer) return { error: 'Pick one of the options, or type an answer.' }
    const asked = toolUsesOf(prior[prior.length - 1].content).find((b) => b.name === CLARIFY_TOOL_NAME)
    if (!asked) return { error: TRANSCRIPT_ERROR }
    answerResult = { type: 'tool_result', tool_use_id: asked.id, content: JSON.stringify({ answer }) }
  }
  const askedSoFar = prior ? clarificationsIn(prior) : 0
  const mayAsk = askedSoFar < MAX_CLARIFICATIONS

  if (await featureOverBudget(VERA_CALENDAR_FEATURE, ctx.spaceId)) {
    return { error: 'Vera has done her share of calendar work for today. Try again tomorrow, or add the dates by hand.' }
  }
  if (await aiRateLimited(VERA_CALENDAR_FEATURE, ctx.profileId)) {
    return { error: 'Vera is catching up. Give it a minute and ask again.' }
  }

  // What the model sees: the fresh context and the ask as the first message, then the prior turns
  // and the answer. What goes back to the box: the same turns with the first message holding the
  // ask ALONE, so the context is never carried by the browser and is rebuilt on every call.
  const opening = `${contextText(ctx, input.mode)}\n\nThe request:\n${ask}\n\nWork it out, then call ${PROPOSE_TOOL_NAME}${mayAsk ? ` (or ${CLARIFY_TOOL_NAME} if you must)` : ''}.`
  const transcript: VeraTranscript = prior ? [{ role: 'user', content: ask }, ...prior.slice(1)] : [{ role: 'user', content: ask }]
  if (answerResult) transcript.push({ role: 'user', content: [answerResult] })
  const messages: CompleteMessage[] = transcript.map((m, i) => (i === 0 ? { role: 'user', content: opening } : m))
  const tools = mayAsk ? [LUNAR_TOOL, CLARIFY_TOOL, PROPOSE_TOOL] : [LUNAR_TOOL, PROPOSE_TOOL]

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  let outcome: ProposeCalendarChangesResult = mayAsk
    ? { error: 'Vera could not turn that into a proposal. Try naming the dates or the Plan.' }
    : { error: 'Vera could not narrow this down. Try naming the Plan or the date, and ask again.' }

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await completeRaw({
        tier: 'sonnet',
        maxTokens: 4000,
        system: withVoice(SYSTEM_STABLE),
        cacheSystem: true,
        tools,
        toolChoice: { type: 'any' },
        messages,
      })
      usage = addUsage(usage, res.usage)
      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const proposal = toolUses.find((b) => b.name === PROPOSE_TOOL_NAME)
      if (proposal) {
        const parsed = parseVeraChanges(proposal.input)
        outcome = 'error' in parsed ? { error: parsed.error } : { kind: 'proposal', changes: parsed.changes, note: cleanNote((proposal.input as { note?: unknown }).note) }
        break
      }
      const question = mayAsk ? toolUses.find((b) => b.name === CLARIFY_TOOL_NAME) : undefined
      if (question) {
        const parsed = parseVeraClarification(question.input)
        if ('error' in parsed) {
          outcome = { error: `${parsed.error} Try naming the Plan or the date, and ask again.` }
        } else {
          // Only the question's own block goes back: a text block or a stray lunar call beside it
          // would be an assistant turn the answer does not address.
          transcript.push({ role: 'assistant', content: [{ type: 'tool_use', id: question.id, name: question.name, input: question.input }] })
          outcome = { kind: 'clarification', ...parsed.clarification, transcript }
        }
        break
      }
      const lookups = toolUses.filter((b) => b.name === LUNAR_TOOL_NAME)
      if (lookups.length === 0) break
      const results: Anthropic.ToolResultBlockParam[] = lookups.map((call) => {
        const r = runLunarTool((call.input ?? {}) as Record<string, unknown>, ctx.timeZone)
        return r.ok
          ? { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify({ phase: (call.input as { phase?: string }).phase, timeZone: ctx.timeZone, days: r.days }) }
          : { type: 'tool_result', tool_use_id: call.id, content: r.error, is_error: true }
      })
      const lookupTurn: CompleteMessage = { role: 'assistant', content: lookups.map((b) => ({ type: 'tool_use' as const, id: b.id, name: b.name, input: b.input })) }
      const resultTurn: CompleteMessage = { role: 'user', content: results }
      messages.push(lookupTurn, resultTurn)
      transcript.push(lookupTurn, resultTurn)
    }
  } catch {
    outcome = { error: 'Vera could not reach the model just now. Try again in a moment.' }
  }

  if (usage.inputTokens + usage.outputTokens > 0) {
    void recordAiUsage({
      feature: VERA_CALENDAR_FEATURE,
      model: MODELS.sonnet,
      usage,
      costUsd: estimateCostUsd('sonnet', usage),
      profileId: ctx.profileId ?? null,
      spaceId: ctx.spaceId,
    })
  }
  return outcome
}

// VERA AT THE CALENDAR (PROG-CAL10, ADR-1386 P6 invariants). A plain-words ask ("pencil a sound bath
// on every new moon this winter") becomes a LIST OF PROPOSED CHANGES in the closed vocabulary of
// lib/calendar/vera-command.ts. Nothing here writes a row: the action that calls this returns the
// proposal to the box, a person ticks the lines, and only `applyVeraChanges` (on the caller's own
// session) touches the calendar. Vera never publishes, sends or books on her own.
//
// Two tools, one bounded loop (at most MAX_ROUNDS model calls per ask):
//   lunar_dates       the model MAY call this first. The server computes the days with
//                     lib/calendar/moon.ts (Meeus) in the Space's zone and feeds them back, so
//                     "every new moon" is arithmetic, never a recollection.
//   propose_changes   the model MUST answer with this. Its input is the change vocabulary, parsed
//                     strictly by parseVeraChanges; anything off-shape is refused as an honest error.
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
  MAX_PENCIL_DAYS,
  MAX_VERA_CHANGES,
  parseVeraChanges,
  stageLabel,
  VERA_STAGES,
  type VeraChange,
  type VeraMode,
} from '@/lib/calendar/vera-command'

export const VERA_CALENDAR_FEATURE = 'vera-calendar'
/** The most model calls one ask may spend: a lunar lookup, a second lookup, the proposal. */
export const MAX_ROUNDS = 3
const MAX_ASK = 600
const MAX_CONTEXT_ROWS = 120
const MAX_LUNAR_SPAN_DAYS = 400

export const LUNAR_TOOL_NAME = 'lunar_dates'
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

export interface VeraCalendarProposal {
  changes: VeraChange[]
  /** One plain line from Vera about what she proposed and what she was not sure of. */
  note: string
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
- Always answer by calling ${PROPOSE_TOOL_NAME}. Do not answer in prose.`

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

export type ProposeCalendarChangesResult = { proposal: VeraCalendarProposal } | { error: string }

/**
 * The plain-words ask, as a proposal. Honest errors, never a silent empty list: the box shows the
 * sentence that comes back, whether it is "Vera is switched off here" or "that was more than 40
 * changes", so a person always knows why nothing was proposed.
 */
export async function proposeCalendarChanges(input: {
  ask: string
  mode: VeraMode
  context: VeraCalendarContext
}): Promise<ProposeCalendarChangesResult> {
  if (!aiEnabled()) return { error: 'Vera is switched off here, so nothing can be proposed. Add dates by hand from Pencil it in.' }
  const ask = input.ask.replace(/\s+/g, ' ').trim().slice(0, MAX_ASK)
  if (!ask) return { error: 'Say what should happen on the calendar, and when.' }
  const ctx = input.context
  if (await featureOverBudget(VERA_CALENDAR_FEATURE, ctx.spaceId)) {
    return { error: 'Vera has done her share of calendar work for today. Try again tomorrow, or add the dates by hand.' }
  }
  if (await aiRateLimited(VERA_CALENDAR_FEATURE, ctx.profileId)) {
    return { error: 'Vera is catching up. Give it a minute and ask again.' }
  }

  const messages: CompleteMessage[] = [
    {
      role: 'user',
      content: `${contextText(ctx, input.mode)}\n\nThe request:\n${ask}\n\nWork it out, then call ${PROPOSE_TOOL_NAME}.`,
    },
  ]
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  let outcome: ProposeCalendarChangesResult = { error: 'Vera could not turn that into a proposal. Try naming the dates or the Plan.' }

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await completeRaw({
        tier: 'sonnet',
        maxTokens: 4000,
        system: withVoice(SYSTEM_STABLE),
        cacheSystem: true,
        tools: [LUNAR_TOOL, PROPOSE_TOOL],
        toolChoice: { type: 'any' },
        messages,
      })
      usage = addUsage(usage, res.usage)
      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const proposal = toolUses.find((b) => b.name === PROPOSE_TOOL_NAME)
      if (proposal) {
        const parsed = parseVeraChanges(proposal.input)
        if ('error' in parsed) {
          outcome = { error: parsed.error }
        } else {
          const raw = (proposal.input as { note?: unknown }).note
          const note = typeof raw === 'string' ? raw.replace(/[\u2013\u2014]/g, ',').replace(/!/g, '.').replace(/\s+/g, ' ').trim().slice(0, 400) : ''
          outcome = { proposal: { changes: parsed.changes, note } }
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
      messages.push({ role: 'assistant', content: res.content })
      messages.push({ role: 'user', content: results })
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

#!/usr/bin/env node
// PROG-CAL10 probe: "Vera at the calendar: ask in plain words, review the proposal, accept".
//
// Measures consequences, not identifiers typed (HYG-108). Each arm names the thing that would be
// broken if it went red:
//   1. The box is REACHABLE: components/spaces/vera-calendar-box.tsx exists and calendar-workspace
//      .tsx renders it as JSX (an import alone is a dead file).
//   2. The propose door READS ONLY: vera-calendar-actions.ts never imports the admin client, and
//      the propose action returns before any store write is called (no insert/update/rpc name
//      appears between its signature and its return).
//   3. The apply door RE-VALIDATES: applyVeraChanges calls parseVeraChanges before the first write,
//      so the browser's list is never trusted.
//   4. The moon is COMPUTED: lib/ai/vera-calendar.ts imports lib/calendar/moon and executes it as a
//      tool result (a tool named lunar_dates whose handler calls lunarPhaseDates); the model is told
//      never to estimate those dates.
//   5. The door is REGISTERED: 'vera-calendar' is a budget key and the module rate-limits per actor.
//   6. Nothing in the seam PUBLISHES: the vocabulary has no publish kind and the apply door never
//      reaches the events publish seam.
//
// Exit 0 = done, 1 = not done, 79 = could not look.

import { existsSync, readFileSync } from 'node:fs'

const read = (f) => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return null
  }
}

const fail = (m) => {
  console.error(`PROG-CAL10: ${m}`)
  process.exit(1)
}

const BOX = 'components/spaces/vera-calendar-box.tsx'
const SHELL = 'components/spaces/calendar-workspace.tsx'
const ACTIONS = 'app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions.ts'
const AI = 'lib/ai/vera-calendar.ts'
const VOCAB = 'lib/calendar/vera-command.ts'
const MOON = 'lib/calendar/moon.ts'
const BUDGET = 'lib/ai/budget.ts'

const shell = read(SHELL)
const budget = read(BUDGET)
if (shell === null || budget === null) {
  console.error('could not read calendar-workspace.tsx or budget.ts')
  process.exit(79)
}

// 1. Reachable.
if (!existsSync(BOX)) fail(`${BOX} does not exist, so there is no Ask Vera box on the calendar`)
const box = read(BOX) ?? ''
const shellNoComments = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
if (!/<VeraCalendarBox\b/.test(shellNoComments)) fail(`${SHELL} never renders <VeraCalendarBox>, so the box is a file nobody can reach`)
for (const hook of ['data-vera-calendar-box', 'id="vera-ask"', 'data-vera-proposal']) {
  if (!box.includes(hook)) fail(`${BOX} lost its ${hook} hook, so the box cannot be found by a person or a test`)
}
if (!/>\s*Accept\s*</.test(box)) fail(`${BOX} has no Accept button, so a proposal can only be discarded`)

// 2. Propose reads only.
const actions = read(ACTIONS)
if (actions === null) fail(`${ACTIONS} does not exist, so nothing asks Vera and nothing applies her proposal`)
if (/supabase\/admin/.test(actions)) fail(`${ACTIONS} imports the admin client, so a Vera write would bypass RLS`)
const proposeStart = actions.indexOf('export async function veraCalendarCommand(')
if (proposeStart < 0) fail(`${ACTIONS} has no veraCalendarCommand action`)
const proposeEnd = actions.indexOf('\n}\n', proposeStart)
const proposeBody = actions.slice(proposeStart, proposeEnd)
if (/\b(insertCalendarEntries|updateCalendarEntryRow|createPenciledPlanRows|updateSpacePlan|transitionSpacePlanRows|transitionPlanStage|addPlanTodo|applyVeraChanges|applyOne|deleteCalendarEntryRow)\s*\(/.test(proposeBody)) {
  fail('veraCalendarCommand writes: the propose door must return the proposal and touch nothing')
}
if (!/proposeCalendarChanges\(/.test(proposeBody)) fail('veraCalendarCommand never asks lib/ai/vera-calendar.ts, so the box gets no proposal')

// 3. Apply re-validates before it writes.
const applyStart = actions.indexOf('export async function applyVeraChanges(')
if (applyStart < 0) fail(`${ACTIONS} has no applyVeraChanges action, so a proposal can never land`)
const applyBody = actions.slice(applyStart)
const parseAt = applyBody.indexOf('parseVeraChanges(')
if (parseAt < 0) fail('applyVeraChanges never re-parses the list the browser sent, so an unchecked shape reaches the stores')
const firstWriteAt = applyBody.search(/\b(applyOne|insertCalendarEntries|updateCalendarEntryRow|createPenciledPlanRows|updateSpacePlan|transitionPlanStage|addPlanTodo)\s*\(/)
if (firstWriteAt < 0) fail('applyVeraChanges never applies anything, so Accept is a button that does nothing')
if (firstWriteAt < parseAt) fail('applyVeraChanges writes BEFORE it re-parses the list, so the parser is decoration')
if (!/results\.push\(\{\s*index/.test(applyBody)) fail('applyVeraChanges does not report one result per change, so a partial failure would be swallowed')

// 4. The moon is computed and fed back as a tool result.
const ai = read(AI)
if (ai === null) fail(`${AI} does not exist, so there is no model call behind the box`)
if (!existsSync(MOON)) fail(`${MOON} does not exist, so a new moon date can only be guessed`)
if (!/from '@\/lib\/calendar\/moon'/.test(ai)) fail(`${AI} does not import lib/calendar/moon, so lunar dates are not computed`)
if (!/lunarPhaseDates\(/.test(ai)) fail(`${AI} never calls lunarPhaseDates, so the moon module is imported and unused`)
if (!/name:\s*LUNAR_TOOL_NAME|name:\s*'lunar_dates'/.test(ai) || !/'lunar_dates'/.test(ai)) fail(`${AI} declares no lunar_dates tool, so the model has nothing to ask the server for`)
if (!/type:\s*'tool_result'/.test(ai)) fail(`${AI} never feeds a tool_result back, so a lunar lookup would end the loop instead of continuing it`)
if (!/never (guess|estimate)/i.test(ai)) fail(`${AI} does not tell the model that moon dates are computed rather than estimated`)
const moon = read(MOON) ?? ''
if (!/lunarPhaseDates/.test(moon) || !/2451550\.09766/.test(moon)) fail(`${MOON} is not the Meeus mean-phase computation`)

// 5. Registered door.
if (!/'vera-calendar':/.test(budget)) fail(`${BUDGET} has no 'vera-calendar' cap, so this door inherits the loose fallback`)
if (!/aiRateLimited\(/.test(ai)) fail(`${AI} does not rate-limit per actor`)
if (!/featureOverBudget\(/.test(ai)) fail(`${AI} does not gate on the daily budget`)
if (!/recordAiUsage\(/.test(ai)) fail(`${AI} never records usage, so the spend is invisible to the ledger`)

// 6. Nothing publishes.
const vocab = read(VOCAB)
if (vocab === null) fail(`${VOCAB} does not exist, so there is no closed vocabulary and no strict parser`)
if (/'publish'/.test(vocab)) fail(`${VOCAB} admits a publish change, which ADR-1386 invariant 1 forbids Vera`)
if (!/MAX_VERA_CHANGES\s*=\s*40/.test(vocab)) fail(`${VOCAB} no longer caps a proposal at 40 changes`)
if (/events\/actions|publishEvent|retirePencilToEvent/.test(actions)) fail(`${ACTIONS} reaches the events publish seam, so an accepted proposal could publish`)

process.exit(0)

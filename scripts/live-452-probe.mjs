#!/usr/bin/env node
// LIVE-452 probe — "The entry drawer's Stage select becomes a four-step timeline" (ADR-1504).
//
// Measures the CONSEQUENCE, never the row's own words. Each assertion would be FALSE if the work
// were undone or regressed:
//
//   1. the drawer renders the kit stepper for an event on its way, and no Stage <select> remains;
//   2. the stepper walks exactly four steps, Pencil · Planning · Production · Publish, from the
//      registry's own labels, and Cancelled is not one of them (it is an exit);
//   3. steps one to three write `stage` into the SAME form state the select wrote (`set('stage', …)`),
//      so every other typed field carries over and nothing auto-saves on click;
//   4. the Publish door's href carries the entry id (`pencil=`), and the Spark honours `pencil` on
//      its own (no Plan needed) while the prefill carries title, dates, zone, location, description;
//   5. Publish saves before it leaves when the drawer holds unsaved edits.
//
// SCAN-1345 (2026-11-27): the staff calendar drawer (staff-calendar.tsx) was retired. The team
// calendar's Details panel (components/calendar-suite/suite-details.tsx) is where a date's stage is
// set now: a four-segment Stage control (Pencil · Planning · Production, with Cancelled as the
// exit), edits that save the moment they are made through the same entry write (so there is never an
// unsaved draft for Publish to lose), and Go live as the Publish door. The arms below that read the
// drawer read the Details panel; the model, the kit stepper, the door and the Spark arms are unchanged.
//
// Runs in-process (no test runner). Exit 0 = done, 1 = not done, 79 = could not look.

import { readFileSync, existsSync } from 'node:fs'

const read = (p) => {
  if (!existsSync(p)) {
    console.error(`could not look: ${p} is missing`)
    process.exit(79)
  }
  return readFileSync(p, 'utf8')
}
// Strip block and line comments so a header's account of the OLD shape cannot satisfy a check.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const drawer = code(read('components/calendar-suite/suite-details.tsx'))
const edits = code(read('lib/calendar/planner/details.ts'))
const model = code(read('lib/calendar/stage-timeline.ts'))
const primitive = code(read('components/ui/stage-timeline.tsx'))
const prefill = code(read('lib/calendar/production-prefill.ts'))
const spark = code(read('app/(main)/events/new/page.tsx'))

const bad = []
const need = (cond, message) => {
  if (!cond) bad.push(message)
}

// ── 1. The Details panel sets the stage with one named control, and no Stage <select> remains ───
need(/label="Stage"[\s\S]{0,160}segments=\{STAGE_SEGMENTS\}/.test(drawer), 'the Details panel no longer sets the stage with the Stage control')
need(/STAGE_SEGMENTS = \[\s*\{ value: 'pencil'[^\]]*'planning'[^\]]*'production'[^\]]*'cancelled'/.test(drawer), 'the Stage control no longer offers Pencil, Planning, Production and the Cancelled exit, in that order')
need(!/id="entry-stage"/.test(drawer) && !/<select/.test(drawer), 'a Stage <select> is back')
need(/role="group"/.test(primitive) && /aria-label=\{label\}/.test(primitive), 'the kit stepper is not a named group')
need(/aria-current=\{current \? 'step' : undefined\}/.test(primitive), 'the kit stepper current step no longer carries aria-current="step"')
need(/type="button"/.test(primitive), 'the kit stepper steps are not real <button type="button"> elements')

// ── 2. Exactly four steps, and Cancelled is an exit ─────────────────────────────────────────────
need(/STAGE_PIPELINE[^\n]*=\s*\['pencil',\s*'planning',\s*'production'\]/.test(model), 'the pipeline is not Pencil, Planning, Production')
need(/PUBLISH_LABEL\s*=\s*'Publish'/.test(model), 'the fourth step is no longer Publish')
need(!/STAGE_PIPELINE[^\n]*cancelled/.test(model), 'Cancelled has crept into the pipeline as a step')
need(/edit\(\{ stage: 'cancelled' \}\)/.test(drawer), 'the Details panel has lost its separate Cancel exit')
need(/'Cancel the Plan' : 'Cancel'/.test(drawer), 'the exit no longer says when it cancels the whole Plan')

// ── 3. A stage change writes through the same entry write as every other field ─────────────────
need(/edit\(\{ stage: next \}\)/.test(drawer), 'the Stage control no longer goes through the Details edit seam')
need(/const next: EntryInput = \{ \.\.\.input/.test(edits), 'a stage edit no longer starts from the date\'s own input, so other fields would not carry over')

// ── 4. The Publish door carries the entry id, and the Spark honours `pencil` alone ─────────────
need(/productionDoorHref\(ctx\.ownSpaceId, item\.entryId, item\.plan, ctx\.returnTo\)/.test(drawer), 'the Go live door is not built from this entry')
need(/new URLSearchParams\(\{\s*space:\s*spaceId,\s*pencil:\s*entryId\s*\}\)/.test(model), 'productionDoorHref no longer carries pencil=<entryId>')
need(/planId\s*\?\s*await getSpacePlan/.test(spark) || /uuid\.test\(planId\)\s*\?\s*await getSpacePlan/.test(spark), 'the Spark requires a Plan again, so a Publish from a date on no Plan opens an empty form')
need(!/if \(!uuid\.test\(planId\) \|\| !uuid\.test\(spaceId\)\) return null/.test(spark), 'the Spark refuses a pencil link without a plan')
need(/productionPrefill\(\s*plan:[^)]*\|\s*null/.test(prefill), 'productionPrefill no longer accepts an entry without a Plan')
for (const field of ['title', 'description', 'location', 'startsAt', 'endsAt', 'timeZone']) {
  need(new RegExp(`\\b${field}\\b`).test(prefill), `the prefill no longer carries ${field}`)
  need(new RegExp(`${field}:\\s*mapped\\.${field}`).test(spark), `the Spark drops ${field} from the prefill`)
}
need(/entry\.description\b/.test(prefill) && !/entry\.notes\b/.test(prefill), 'Team notes reach the Spark, or Description does not (ADR-1388 §5)')

// ── 5. Nothing typed is lost on Publish: every Details field saves when the person leaves it ─────
need(/onCommit=\{\(description\) => void edit\(\{ description \}\)\}/.test(drawer), 'the description no longer saves on leave, so Go live could carry stale copy')
need(/href=\{goLive\}/.test(drawer), 'Go live is no longer the Publish door')

if (bad.length) {
  console.error('LIVE-452 not done:')
  for (const b of bad) console.error(`  - ${b}`)
  process.exit(1)
}
console.log('LIVE-452 done: one Stage control with Cancelled as the exit, no Stage select, Go live carries the entry id, and every field saves before it leaves.')

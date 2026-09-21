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

const drawer = code(read('app/(main)/spaces/[slug]/settings/calendar/staff-calendar.tsx'))
const model = code(read('lib/calendar/stage-timeline.ts'))
const primitive = code(read('components/ui/stage-timeline.tsx'))
const prefill = code(read('lib/calendar/production-prefill.ts'))
const spark = code(read('app/(main)/events/new/page.tsx'))

const bad = []
const need = (cond, message) => {
  if (!cond) bad.push(message)
}

// ── 1. The drawer renders the stepper and no Stage <select> remains ─────────────────────────────
need(/<StageTimeline\b/.test(drawer), 'the drawer no longer renders the StageTimeline stepper')
need(!/id="entry-stage"/.test(drawer), 'the drawer still carries the Stage <select> (id="entry-stage")')
need(!/ENTRY_STAGES\.map\(\(st\)\s*=>\s*\(\{\s*value:\s*st\.stage/.test(drawer), 'the drawer still builds Stage <select> options from ENTRY_STAGES')
need(/role="group"/.test(primitive) && /aria-label=\{label\}/.test(primitive), 'the stepper is not a named group')
need(/aria-current=\{current \? 'step' : undefined\}/.test(primitive), 'the current step no longer carries aria-current="step"')
need(/type="button"/.test(primitive), 'the steps are not real <button type="button"> elements')

// ── 2. Exactly four steps, and Cancelled is an exit ─────────────────────────────────────────────
need(/STAGE_PIPELINE[^\n]*=\s*\['pencil',\s*'planning',\s*'production'\]/.test(model), 'the pipeline is not Pencil, Planning, Production')
need(/PUBLISH_LABEL\s*=\s*'Publish'/.test(model), 'the fourth step is no longer Publish')
need(!/STAGE_PIPELINE[^\n]*cancelled/.test(model), 'Cancelled has crept into the pipeline as a step')
need(/set\('stage',\s*'cancelled'\)/.test(drawer), 'the drawer has lost its separate "Cancel this date" exit')
need(/Cancel this date/.test(drawer), 'the exit is no longer named "Cancel this date"')

// ── 3. Steps write the same form state the select wrote; nothing auto-saves on click ───────────
const stepFn = drawer.match(/const step = \(key: string\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
need(/set\('stage',\s*key\)/.test(stepFn), 'a step no longer writes `stage` into the drawer form state, so typed fields would not carry over')
need(!/saveCalendarEntry/.test(stepFn), 'a stage step saves on click; ADR-1504 says the change persists on Save, as the select did')

// ── 4. The Publish door carries the entry id, and the Spark honours `pencil` alone ─────────────
need(/productionDoorHref\(spaceId,\s*id,\s*draft\.input\.planId\)/.test(drawer), 'the Publish door is not built from this entry')
need(/new URLSearchParams\(\{\s*space:\s*spaceId,\s*pencil:\s*entryId\s*\}\)/.test(model), 'productionDoorHref no longer carries pencil=<entryId>')
need(/planId\s*\?\s*await getSpacePlan/.test(spark) || /uuid\.test\(planId\)\s*\?\s*await getSpacePlan/.test(spark), 'the Spark requires a Plan again, so a Publish from a date on no Plan opens an empty form')
need(!/if \(!uuid\.test\(planId\) \|\| !uuid\.test\(spaceId\)\) return null/.test(spark), 'the Spark refuses a pencil link without a plan')
need(/productionPrefill\(\s*plan:[^)]*\|\s*null/.test(prefill), 'productionPrefill no longer accepts an entry without a Plan')
for (const field of ['title', 'description', 'location', 'startsAt', 'endsAt', 'timeZone']) {
  need(new RegExp(`\\b${field}\\b`).test(prefill), `the prefill no longer carries ${field}`)
  need(new RegExp(`${field}:\\s*mapped\\.${field}`).test(spark), `the Spark drops ${field} from the prefill`)
}
need(/entry\.description\b/.test(prefill) && !/entry\.notes\b/.test(prefill), 'Team notes reach the Spark, or Description does not (ADR-1388 §5)')

// ── 5. Publish saves first when there are unsaved edits ─────────────────────────────────────────
const publishFn = drawer.match(/const publish = \(\) => \{[\s\S]*?router\.push\(href\)/)?.[0] ?? ''
need(publishFn.length > 0, 'the Publish step no longer navigates to the Spark')
need(/saveCalendarEntry\(slug,\s*id,\s*draft\.input\)/.test(publishFn), 'Publish leaves without saving unsaved edits, so typed fields are lost')
need(/dirty/.test(publishFn), 'Publish no longer checks for unsaved edits')

if (bad.length) {
  console.error('LIVE-452 not done:')
  for (const b of bad) console.error(`  - ${b}`)
  process.exit(1)
}
console.log('LIVE-452 done: four-step timeline, no Stage select, Publish carries the entry id and saves first.')

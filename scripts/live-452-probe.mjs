#!/usr/bin/env node
// LIVE-452 probe — "The entry drawer's Stage select becomes a four-step timeline" (ADR-1504).
//
// Measures the CONSEQUENCE, never the row's own words. The pure halves are RUN, not read: the step
// model and the Spark prefill are transpiled in process and called, so a module that still names a
// field but no longer carries it fails here. The React drawer and the Spark route are read, because
// running them needs a browser and a database; their arms are written so an undo trips them.
//
//   1. the drawer renders the kit stepper for an event on its way, and no Stage <select> remains;
//   2. the step model walks exactly four steps, Pencil · Planning · Production · Publish, with the
//      REGISTRY's own labels and hints, and Cancelled is an exit, not a step;
//   3. a refused move is refused in the row, with the sentence the save action refuses with;
//   4. steps one to three write `stage` into the SAME form state the select wrote, so every other
//      typed field carries over and nothing auto-saves on click;
//   5. the Publish door carries the entry id, the Spark honours `pencil` with no Plan, and the
//      prefill really carries title, description, location, both dates and the entry's own zone,
//      while Team notes never reach it;
//   6. Publish saves before it leaves when the drawer holds unsaved edits;
//   7. the stepper spends design tokens, never a raw hex, and restates no stage name of its own.
//
// Exit 0 = done, 1 = not done, 79 = could not look.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const cannotLook = (why) => {
  console.error(`could not look: ${why}`)
  process.exit(79)
}

const read = (p) => {
  if (!existsSync(p)) cannotLook(`${p} is missing`)
  return readFileSync(p, 'utf8')
}
// Strip block and line comments so a header's account of the OLD shape cannot satisfy a check.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── Run the pure halves ─────────────────────────────────────────────────────────────────────────
// A tiny in-process loader: transpile a repo .ts file and call it. No test runner, no build.
const ROOT = process.cwd()
let ts
try {
  ts = (await import('typescript')).default
} catch {
  cannotLook('typescript is not installed, so the pure modules cannot be run')
}
const loaded = new Map()
const resolveSpec = (spec, from) => {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : resolve(dirname(from), spec)
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(c)) return c
  cannotLook(`cannot resolve ${spec} from ${from}`)
}
const load = (file) => {
  if (loaded.has(file)) return loaded.get(file)
  const js = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  loaded.set(file, mod.exports)
  new Function('exports', 'require', 'module', js)(mod.exports, (s) => load(resolveSpec(s, file)), mod)
  loaded.set(file, mod.exports)
  return mod.exports
}

let model, registry, prefillMod
try {
  model = load(join(ROOT, 'lib/calendar/stage-timeline.ts'))
  registry = load(join(ROOT, 'lib/calendar/registry.ts'))
  prefillMod = load(join(ROOT, 'lib/calendar/production-prefill.ts'))
} catch (err) {
  cannotLook(`the pure modules would not load: ${err.message}`)
}
const { stageTimeline, productionDoorHref, PUBLISH_STEP } = model
const { ENTRY_STAGES } = registry
const { productionPrefill } = prefillMod
if (typeof stageTimeline !== 'function' || typeof productionDoorHref !== 'function' || typeof productionPrefill !== 'function') {
  console.error('LIVE-452 not done:\n  - lib/calendar/stage-timeline.ts no longer exports the step model and the Production door')
  process.exit(1)
}

const drawer = code(read('app/(main)/spaces/[slug]/settings/calendar/staff-calendar.tsx'))
const primitiveSrc = read('components/ui/stage-timeline.tsx')
const primitive = code(primitiveSrc)
const spark = code(read('app/(main)/events/new/page.tsx'))

const bad = []
const need = (cond, message) => {
  if (!cond) bad.push(message)
}
const stageDef = (stage) => ENTRY_STAGES.find((d) => d.stage === stage)
const walk = (stage, oneOfSeveral = false) => stageTimeline({ stage, oneOfSeveral })
const at = (plan, key) => plan.steps.find((s) => s.key === key)

// ── 1. The drawer renders the stepper and no Stage <select> remains ─────────────────────────────
need(/<StageTimeline\b/.test(drawer), 'the drawer no longer renders the StageTimeline stepper')
need(!/id="entry-stage"/.test(drawer), 'the drawer still carries the Stage <select> (id="entry-stage")')
need(!/ENTRY_STAGES\.map\(\(st\)\s*=>\s*\(\{\s*value:\s*st\.stage/.test(drawer), 'the drawer still builds Stage <select> options from ENTRY_STAGES')
need(/role="group"/.test(primitive) && /aria-label=\{label\}/.test(primitive), 'the stepper is not a named group')
need(/aria-current=\{current \? 'step' : undefined\}/.test(primitive), 'the current step no longer carries aria-current="step"')
need(/type="button"/.test(primitive), 'the steps are not real <button type="button"> elements')

// ── 2. Four steps, the registry's own words, and Cancelled is an exit ───────────────────────────
const planning = walk('planning')
need(
  JSON.stringify(planning.steps.map((s) => s.key)) === JSON.stringify(['pencil', 'planning', 'production', PUBLISH_STEP]),
  `the row no longer walks Pencil, Planning, Production, Publish (it walks ${planning.steps.map((s) => s.key).join(' → ')})`,
)
for (const stage of ['pencil', 'planning', 'production']) {
  const def = stageDef(stage)
  if (!def) {
    bad.push(`the registry no longer declares the ${stage} stage the row walks`)
    continue
  }
  const plan = walk(stage)
  need(at(plan, stage)?.label === def.label, `the ${stage} step restates its name instead of reading the registry's ("${at(plan, stage)?.label}" vs "${def.label}")`)
  need(plan.hint === def.hint, `the ${stage} hint restates the registry's line instead of reading it`)
  need(at(plan, stage)?.state === 'current', `the ${stage} step is not marked current when the date is at that stage`)
}
need(at(planning, PUBLISH_STEP)?.label === 'Publish', 'the fourth step is no longer Publish')
need(
  JSON.stringify(planning.steps.map((s) => s.state)) === JSON.stringify(['done', 'current', 'upcoming', 'upcoming']),
  'the row no longer reads as done · current · upcoming, so a person cannot see where they are',
)
need(!planning.steps.some((s) => s.key === 'cancelled'), 'Cancelled has crept into the pipeline as a step')
const cancelled = walk('cancelled')
need(cancelled.cancelled === true && !cancelled.steps.some((s) => s.state === 'current'), 'a Cancelled date still reads as sitting on a step')
need(cancelled.hint === stageDef('cancelled')?.hint, 'a Cancelled date no longer shows the registry Cancelled hint')
need(at(cancelled, 'pencil')?.disabled === false, 'a Cancelled date can no longer be brought back to Pencil')
need(/set\('stage',\s*'cancelled'\)/.test(drawer), 'the drawer has lost its separate "Cancel this date" exit')
need(/Cancel this date/.test(drawer), 'the exit is no longer named "Cancel this date"')

// ── 3. A refused move is refused in the row, in the action's own words ──────────────────────────
const held = walk('pencil', true)
for (const key of ['planning', 'production', PUBLISH_STEP]) {
  need(at(held, key)?.disabled === true, `a date that is one of several can be moved to ${key} from the row (ADR-1388 §3)`)
}
need(held.reasons.length > 0 && /several/i.test(held.reasons[0]), 'the row no longer says WHY a date that is one of several cannot move')
need(at(walk('planning'), PUBLISH_STEP)?.disabled === true, 'Publish opens before the date is a Production')
need(walk('planning').reasons.some((r) => /Production/.test(r)), 'Publish is shut before Production without saying what to do first')
need(at(walk('production'), PUBLISH_STEP)?.disabled === false, 'Publish is shut even at Production, so the door never opens')
need(at(walk('production'), PUBLISH_STEP)?.state === 'upcoming', 'the Publish door reads as where you are; a door is never a stage')

// ── 4. Steps write the same form state the select wrote; nothing auto-saves on click ───────────
const stepFn = drawer.match(/const step = \(key: string\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
need(/set\('stage',\s*key\)/.test(stepFn), 'a step no longer writes `stage` into the drawer form state, so typed fields would not carry over')
need(!/saveCalendarEntry/.test(stepFn), 'a stage step saves on click; ADR-1504 says the change persists on Save, as the select did')

// ── 5. The Publish door, and what the Spark is actually handed ─────────────────────────────────
need(productionDoorHref('s1', 'e1') === '/events/new?space=s1&pencil=e1', 'the Production door no longer opens the Spark from this entry (pencil=<entryId>)')
need(productionDoorHref('s1', 'e1', 'p1').includes('plan=p1'), 'the Production door drops the Plan link when the date is on a Plan')
need(!productionDoorHref('s1', 'e1', null).includes('plan='), 'the Production door invents a Plan for a date that is on none')
need(/productionDoorHref\(spaceId,\s*id,\s*draft\.input\.planId\)/.test(drawer), 'the Publish door is not built from this entry')
need(/planId\s*\?\s*await getSpacePlan/.test(spark) || /uuid\.test\(planId\)\s*\?\s*await getSpacePlan/.test(spark), 'the Spark requires a Plan again, so a Publish from a date on no Plan opens an empty form')
need(!/if \(!uuid\.test\(planId\) \|\| !uuid\.test\(spaceId\)\) return null/.test(spark), 'the Spark refuses a pencil link without a plan')

const entry = {
  id: 'e1',
  title: 'Equinox gathering',
  description: 'We gather at dusk.',
  notes: 'Team only: pay the sound guy.',
  location: 'The hall',
  starts_at: '2026-09-22T19:00:00Z',
  ends_at: '2026-09-22T21:00:00Z',
  time_zone: 'America/Los_Angeles',
  plan_id: null,
}
let carried
try {
  carried = productionPrefill(null, entry)
} catch (err) {
  bad.push(`the prefill no longer works from a date that is on no Plan: ${err.message}`)
  carried = {}
}
const CARRIES = {
  title: 'Equinox gathering',
  description: 'We gather at dusk.',
  location: 'The hall',
  startsAt: '2026-09-22T19:00',
  endsAt: '2026-09-22T21:00',
  timeZone: 'America/Los_Angeles',
}
for (const [field, want] of Object.entries(CARRIES)) {
  need(carried[field] === want, `the Spark opens without the date's ${field} (got ${JSON.stringify(carried[field])}, wanted ${JSON.stringify(want)})`)
  need(new RegExp(`${field}:\\s*mapped\\.${field}`).test(spark), `the Spark drops ${field} from the prefill`)
}
need(carried.sourceEntryId === 'e1', 'the Spark no longer knows which Pencil it came from, so the entry is never retired')
need(carried.planId === '', 'the prefill invents a Plan for a date that is on none')
need(
  !Object.values(carried).some((v) => typeof v === 'string' && v.includes('Team only')),
  'Team notes reach the Spark, which is public copy (ADR-1388 §5)',
)
// Team notes are the one field that must NOT travel, so ask with the public copy empty: that is the
// only shape in which a fallback to notes would show.
const noCopy = productionPrefill(null, { ...entry, description: '' })
need(
  !Object.values(noCopy).some((v) => typeof v === 'string' && v.includes('Team only')),
  'Team notes fill the Spark description when a date has none, and Team notes are not public copy (ADR-1388 §5)',
)
need(carried.description === 'We gather at dusk.', 'the date’s own description no longer reaches the Spark')
const onPlan = productionPrefill({ id: 'p1', title: 'Equinox', notes: null }, { ...entry, plan_id: 'p1' })
need(onPlan.planId === 'p1', 'the prefill drops the link back to the Plan a date belongs to')

// ── 6. Publish saves first when there are unsaved edits ────────────────────────────────────────
const publishFn = drawer.match(/const publish = \(\) => \{[\s\S]*?router\.push\(href\)/)?.[0] ?? ''
need(publishFn.length > 0, 'the Publish step no longer navigates to the Spark')
need(/saveCalendarEntry\(slug,\s*id,\s*draft\.input\)/.test(publishFn), 'Publish leaves without saving unsaved edits, so typed fields are lost')
need(/dirty/.test(publishFn), 'Publish no longer checks for unsaved edits')

// ── 7. The stepper spends tokens, and restates no stage of its own ─────────────────────────────
need(!/#[0-9a-fA-F]{3,8}\b/.test(primitiveSrc), 'the stepper hardcodes a hex colour instead of spending a design token')
need(!/\b(?:bg|text|border|ring|fill|stroke)-\[/.test(primitive), 'the stepper reaches for an arbitrary colour value instead of a design token')
for (const def of ENTRY_STAGES) {
  need(!new RegExp(`['"\`]${def.label}['"\`]`).test(primitive), `the stepper restates the ${def.stage} stage name; the step model hands it the registry's`)
}

if (bad.length) {
  console.error('LIVE-452 not done:')
  for (const b of bad) console.error(`  - ${b}`)
  process.exit(1)
}
console.log('LIVE-452 done: four steps in the registry\'s own words, no Stage select, refusals said in the row, and a Publish door that saves first and hands the Spark the whole date.')

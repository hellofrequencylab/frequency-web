#!/usr/bin/env node
// PROG-CAL3 probe — "Production: the Spark opens prefilled from the plan, and the Pencil BECOMES
// the event".
//
// ── WHY THIS REPLACED THE OLD PROBE ─────────────────────────────────────────────────────────────
// The row closed on 2026-09-19 behind a probe that asked whether four strings appeared in four
// files: `EVENT_MANIFEST`, `plan_id`, `pencilId`, `planParam`. All four were there and every one of
// them was there for the wrong reason. Verified against production on 2026-09-21:
//
//   • `pencilId` appeared because the publish path HARD-DELETED the Pencil — description, Team
//     notes and hold gone with it. The row's own detail says "removed (or marked source of the
//     event)"; only the destructive half ever shipped.
//   • `plan_id` appeared because it was read off the form, checked for a UUID SHAPE alone, and
//     written with the service-role client. Nothing checked it against the Space.
//   • Nothing at all advanced the Plan. `transitionSpacePlanRows` had two callers, both in Space
//     calendar settings, neither on the publish path, so every published Plan stayed at Pencil or
//     Planning on the Workflow board for ever.
//   • And `plan-board.tsx` built its "Make it a Production" href with no entryId, so
//     `productionPrefill` never ran from the board and the Spark opened holding a title.
//
// A probe that four such defects can satisfy is the shape-not-truth failure scripts/check-backlog
// names in its own header. This one measures CONSEQUENCES: the call that must be gone, the write
// that must happen, the filter that keeps the invariant, the column the migration must add.
//
// Exit 0 = done, 1 = not done, 79 = could not look.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const read = (p) => {
  if (!existsSync(p)) {
    console.error(`could not look: ${p} is missing`)
    process.exit(79)
  }
  return readFileSync(p, 'utf8')
}

const actions = read('app/(main)/events/actions.ts')
const entriesStore = read('lib/calendar/entries-store.ts')
const entries = read('lib/calendar/entries.ts')
const prefill = read('lib/calendar/production-prefill.ts')
const planLink = read('lib/events/plan-link.ts')
const plans = read('lib/calendar/plans.ts')
const board = read('app/(main)/spaces/[slug]/settings/calendar/plan-board.tsx')
const newPage = read('app/(main)/events/new/page.tsx')

const MIGRATIONS = 'supabase/migrations'
if (!existsSync(MIGRATIONS)) {
  console.error('could not look: supabase/migrations is missing')
  process.exit(79)
}
const migrations = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
  .join('\n')

/** Comments explain what was removed and why, so an "it must be GONE" assertion has to read the
 *  CODE. Stripping is crude on purpose — it only has to keep a prose mention out of a grep. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const actionsCode = stripComments(actions)

const bad = []
const need = (cond, message) => {
  if (!cond) bad.push(message)
}

// 1. THE PREFILL READS THE MANIFEST, never its own list of what an event needs (ADR-1386
//    invariant 3), and the Spark accepts both halves of the link.
need(prefill.includes('EVENT_MANIFEST'), 'production-prefill does not read the event manifest')
need(
  newPage.includes('planParam') && newPage.includes('pencilParam') && newPage.includes('productionPrefill'),
  '/events/new does not prefill the Spark from plan + pencil',
)

// 2. PUBLISHING NO LONGER DESTROYS THE PENCIL. The delete call must be GONE from the create path,
//    and the retire write must be what happens instead.
need(
  !/deleteCalendarEntryRow/.test(actionsCode),
  'app/(main)/events/actions.ts still calls deleteCalendarEntryRow: publishing destroys the Pencil',
)
need(
  actions.includes('retirePencilToEvent'),
  'the publish path does not retire the Pencil onto its event (retirePencilToEvent)',
)
need(
  /published_event_id:\s*eventId/.test(entriesStore) && /stage:\s*'production'/.test(entriesStore),
  'retirePencilToEvent does not set published_event_id + stage on the entry',
)

// 3. THE RETIRED PENCIL STOPS RENDERING AS ITS OWN ITEM, or ADR-1386's "never beside it as a
//    duplicate" is broken by the row surviving: admin-calendar merges events and entries as two
//    separate arrays, so two cards would land on the same day.
need(
  /\.is\('published_event_id',\s*null\)/.test(entriesStore),
  'the staff entries query does not exclude dates that already became a Production',
)
need(
  entries.includes('published_event_id'),
  'EntryRow / ENTRY_COLS do not carry published_event_id',
)
need(
  /add column if not exists published_event_id/i.test(migrations),
  'no migration adds space_calendar_entries.published_event_id',
)

// 4. PUBLISHING ADVANCES THE PLAN. The whole point of phase 3: a published Plan that stays at
//    Pencil on the Workflow board has not become a Production in any sense the operator can see.
need(
  actions.includes('transitionSpacePlanRows'),
  'the publish path never advances the Plan stage (transitionSpacePlanRows)',
)
need(
  /'production'/.test(actions) && /closeProductionSeam/.test(actions),
  'the publish path does not close the Production seam',
)

// 5. THE FAIL-SAFE IS NOTICED (AGENTS.md: "every fail-safe needs a gate that notices it fired").
//    The stage transition is best-effort on purpose, so both a log line and a derived, in-product
//    lag have to exist — a swallowed failure is an invisible regression.
need(
  actions.includes('calendar.production_plan_stage_not_advanced'),
  'a failed Plan advance is swallowed with no structured log event',
)
need(
  plans.includes('planPublishLag'),
  'nothing derives the lag a failed Plan advance leaves behind (planPublishLag)',
)

// 6. THE PLAN LINK IS AUTHORIZED, not merely UUID-shaped, and it is NOT create-only.
need(
  planLink.includes('getSpacePlan'),
  'the plan link is not authorized against the Space (getSpacePlan)',
)
need(
  actions.includes('resolvePlanLink'),
  'createEvent / updateEvent do not resolve the plan link through the one authority',
)
need(
  (actions.match(/resolvePlanLink/g) ?? []).length >= 2,
  'the plan link is still create-only: updateEvent never touches plan_id',
)
need(
  planLink.includes('setEventPlan'),
  'no door exists for attaching an existing event to a Plan',
)

// 7. THE BOARD PASSES THE PENCIL. Without an entryId the Spark opens with a title and nothing else.
need(
  /entryId:\s*pencilByPlan/.test(board),
  'plan-board builds its "Make it a Production" href without the Pencil, so nothing is prefilled',
)

if (bad.length > 0) {
  for (const b of bad) console.error(`✗ ${b}`)
  process.exit(1)
}
console.log('✓ PROG-CAL3: the Pencil becomes its Production, the Plan advances, the link is authorized and repairable')

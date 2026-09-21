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
// The repo's quote-aware comment scanner, not a regex pair. THE NAIVE VERSION WAS WRONG HERE AND
// it silently weakened this probe's strongest assertion: app/(main)/events/actions.ts contains a
// LINE comment holding the characters `/*`, and `src.replace(/\/\*[\s\S]*?\*\//g, '')` treats that
// as the start of a block comment — blanking 34k characters, the entire createEvent insert among
// them. "deleteCalendarEntryRow must be GONE" would then pass because the region it would appear
// in had been deleted from the haystack. A single-pass scanner that consumes `//` to end-of-line
// before it can ever open a block cannot make that mistake.
import { stripComments } from './check-module-reachability.mjs'

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
 *  CODE, never the prose about it. */
const actionsCode = stripComments(actions)

const bad = []
const need = (cond, message) => {
  if (!cond) bad.push(message)
}

// ── 0. INHERITED VERBATIM FROM THE 2026-09-21 REOPEN PROBE ──────────────────────────────────────
// This script GREW from the inline `node -e` probe the reopen installed, so that its assertions
// could be commented and added to — it did not replace it. AGENTS.md: "Close a row by making its
// probe pass. Never delete the probe." The three the reopen measured are reproduced here first,
// word for word in behaviour and message, and everything below is strictly additional.
const updateEventBody = actions.split('export async function updateEvent')[1] || ''

need(
  /transitionSpacePlanRows|transition_space_plan_stage/.test(actions),
  'publishing an event still does not advance its Plan to production, so every published Plan stays stuck on the board',
)
need(
  !/deleteCalendarEntryRow/.test(actions) || /published_event_id|pencil_archived|archived_at/.test(actions),
  'publishing still hard-deletes the pencil entry, losing the date history with no archive or back-pointer',
)
need(
  /plan_id/.test(updateEventBody),
  'updateEvent still cannot set plan_id, so a broken Plan-to-Event link can never be repaired from the app',
)

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
  /resolvePlanLink/.test(updateEventBody),
  'the plan link is still create-only: updateEvent never resolves one (a `plan_id` mention alone satisfied the reopen probe, so this reads updateEvent\'s OWN body)',
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

// 8. THE PLAN SEAM ANSWERS TO THE HOSTING SPACE, ROOT EXCLUDED. `stampEventSpaceId` stamps the
//    root tenant onto every event that names no Space, so authorizing the link against the raw
//    `space_id` (or a hand-rolled `host_space_id ?? space_id`) reads "Frequency" as a real host for
//    every personal event — the LIVE-075 defect lib/events/host-space.ts was written to end.
need(
  /resolveHostingSpaceId\b/.test(actionsCode) && /resolveHostingSpaceIdFromRow/.test(actionsCode),
  'the Plan seam does not resolve the hosting Space through lib/events/host-space.ts, so the root tenant authorizes Plan links on personal events',
)
need(
  !/host_space_id \?\? evRow|evRow\?\.host_space_id \?\? evRow\?\.space_id/.test(actionsCode),
  'updateEvent hand-rolls the host_space_id ?? space_id pair instead of using the one resolver, so it skips the root guard',
)

if (bad.length > 0) {
  for (const b of bad) console.error(`✗ ${b}`)
  process.exit(1)
}
console.log('✓ PROG-CAL3: the Pencil becomes its Production, the Plan advances, the link is authorized and repairable')

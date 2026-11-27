#!/usr/bin/env node
// LIVE-462 probe — "a successful save must not leave the entry drawer disabled".
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
// Every control in the Space calendar's entry drawer is `disabled={pending}`, where `pending` is
// `useTransition`'s. Both write paths called `router.refresh()` from INSIDE `startTransition`, and
// a transition stays pending until everything it scheduled has committed. `router.refresh()`
// re-renders the route's Server Components, so the drawer stayed frozen after a SUCCESSFUL save
// for as long as the server took — on a cold deployment holding a 16-month operator horizon, that
// is seconds of a form showing "Saving" over a row that is already in the database.
//
// ── THE EVIDENCE, WHICH IS WHY THIS IS NOT A GUESS ──────────────────────────────────────────────
// `operator-calendar.spec.ts` failed three tests the first run it was ever allowed to take (the
// whole file had been skipping for want of manage rights on PW_SPACE_SLUG's Space; OWN-081 granted
// them). All three failed AFTER "Pencil date": repeated "element is not enabled", then "element
// was detached from the DOM". The `space_plans` rows those runs created are in the database,
// timestamped to the second the test clicked. The server never failed; only the client said so.
//
// ── WHAT THIS MEASURES ──────────────────────────────────────────────────────────────────────────
// Not "is there a useEffect" — that is a spelling. Two properties, either of which breaking brings
// the freeze back or trades it for a stale month:
//   • the component never calls router.refresh() at all. In a Server Function, revalidatePath
//     "updates the UI immediately (if viewing the affected path)" (this Next version's own
//     revalidatePath.md:19), so the action's round trip already carries the fresh tree and a client
//     refresh is a second full render — inside a transition, it is the freeze;
//   • and every write action the drawer calls still ends in revalidate(slug), which is the thing
//     that actually keeps the month and the Plan list fresh once the client refresh is gone.
//
// Exit 0 = done, 1 = not done, 79 = could not look.

import { existsSync, readFileSync, readdirSync } from 'node:fs'

// SCAN-1345 (2026-11-27): the staff calendar's drawer (staff-calendar.tsx) was retired; the team
// calendar is the suite (components/calendar-suite/), whose Details panel is where a date is edited
// now. The defect is the same shape there: a write that also refreshes the route from the client
// holds every `disabled={busy}` control until the second render lands. So this reads the suite.
const DIR = 'components/calendar-suite/'
if (!existsSync(DIR)) {
  console.error(`could not read ${DIR}`)
  process.exit(79)
}
const fail = (m) => {
  console.error(`LIVE-462: ${m}`)
  process.exit(1)
}

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const files = readdirSync(DIR).filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))
const code = files.map((n) => strip(readFileSync(DIR + n, 'utf8'))).join('\n')

// 1. The Details controls are still gated on the write in flight. If that ever stops being true this
//    probe is measuring nothing, and it should say so rather than pass quietly.
if (!/disabled=\{busy\}/.test(code)) {
  console.error('LIVE-462: no control in the team calendar is disabled={busy} any more; re-read this probe before trusting it')
  process.exit(79)
}

// 2. NO CLIENT REFRESH IN THE TEAM CALENDAR. Any router.refresh() is a second render the action
//    already did, and while a write is in flight it is the freeze.
if (/router\.refresh\(\)/.test(code)) {
  fail(
    'router.refresh() is in the team calendar (components/calendar-suite/). The write actions already ' +
      'revalidate both calendar routes inside the action, which re-renders the viewed page in the same ' +
      'round trip; a client refresh on top is a second full render that holds every disabled={busy} control.',
  )
}

// 3. AND THE WRITES STILL REVALIDATE. Deleting the client refresh is only safe because the actions
//    refresh the page themselves; a write that stops doing so leaves the month stale after a save,
//    which is the worse bug wearing this one's clothes.
const actions = readFileSync('app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts', 'utf8')
const entryActions = existsSync('app/(main)/spaces/[slug]/settings/calendar/entry-actions.ts')
  ? readFileSync('app/(main)/spaces/[slug]/settings/calendar/entry-actions.ts', 'utf8')
  : ''
const both = actions + '\n' + entryActions
if (!/function revalidate\(slug: string\) \{[\s\S]*?revalidatePath\(`\/spaces\/\$\{slug\}\/calendar`\)/.test(both)) {
  fail('revalidate(slug) no longer revalidates /spaces/<slug>/calendar, the route the drawer is used on, so nothing refreshes the page after a save now that the client refresh is gone')
}
for (const name of ['saveCalendarEntry', 'deleteCalendarEntry']) {
  const at = both.indexOf(`export async function ${name}(`)
  if (at < 0) fail(`${name} is gone; re-read this probe`)
  const next = both.indexOf('\nexport async function ', at + 10)
  const fnBody = both.slice(at, next < 0 ? both.length : next)
  if (!fnBody.includes('revalidate(slug)')) {
    fail(`${name} no longer calls revalidate(slug), so the page it was called from is stale after the write — the client refresh that used to paper over that is gone by design`)
  }
}

// 4. The staff drawer's "Open Plan" button, which was gated on a stale server prop, retired with the
//    drawer (SCAN-1345). The suite selects a Plan by its id (`select({ kind: 'plan', id })`), so there
//    is no object lookup left to go stale.
if (!/kind: 'plan', id/.test(code)) {
  console.error('LIVE-462: could not find the team calendar selecting a Plan by id; re-read this probe before trusting it')
  process.exit(79)
}

console.log('✓ LIVE-462: no client refresh in the team calendar, every write still revalidates the calendar routes, and a Plan opens by id.')

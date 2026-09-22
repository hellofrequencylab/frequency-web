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

import { existsSync, readFileSync } from 'node:fs'

const FILE = 'app/(main)/spaces/[slug]/settings/calendar/staff-calendar.tsx'
if (!existsSync(FILE)) {
  console.error(`could not read ${FILE}`)
  process.exit(79)
}
const fail = (m) => {
  console.error(`LIVE-462: ${m}`)
  process.exit(1)
}

const src = readFileSync(FILE, 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// 1. The drawer's controls are still gated on `pending` — if that ever stops being true this probe
//    is measuring nothing, and it should say so rather than pass quietly.
if (!/disabled=\{pending\}/.test(code)) {
  console.error('LIVE-462: no control in this drawer is disabled={pending} any more; re-read this probe before trusting it')
  process.exit(79)
}

// 2. NO CLIENT REFRESH IN THIS FILE. Any router.refresh() — in a transition, in a helper, in an
//    effect — is a second render the action already did, and inside the transition it is the freeze.
if (/router\.refresh\(\)/.test(code)) {
  fail(
    'router.refresh() is back in staff-calendar.tsx. The write actions already revalidate both ' +
      'calendar routes inside the action, which re-renders the viewed page in the same round trip; ' +
      'a client refresh on top is a second full render, and inside startTransition it re-freezes ' +
      'every disabled={pending} control until it returns.',
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
for (const name of ['createPenciledPlan', 'saveCalendarEntry', 'deleteCalendarEntry']) {
  const at = both.indexOf(`export async function ${name}(`)
  if (at < 0) fail(`${name} is gone; re-read this probe`)
  const next = both.indexOf('\nexport async function ', at + 10)
  const fnBody = both.slice(at, next < 0 ? both.length : next)
  if (!fnBody.includes('revalidate(slug)')) {
    fail(`${name} no longer calls revalidate(slug), so the page it was called from is stale after the write — the client refresh that used to paper over that is gone by design`)
  }
}

// 4. THE SECOND HALF OF THE SAME DEFECT: a successful save must leave the operator able to ACT.
//    "Open Plan" used to be gated on finding the Plan inside the `plans` server prop, which on the
//    one path that matters — opening the Plan the save just created — has not caught up. `find`
//    returned undefined, the guard fell through to `setOpenPlan(null)`, and the button did nothing
//    at all. `onOpenPlan` takes an ID (calendar-workspace.tsx's `selectPlan` only sets state and
//    writes `?plan=`), so requiring the object was never necessary.
const openPlan = code.slice(code.indexOf('Open Plan') - 1400, code.indexOf('Open Plan'))
if (!openPlan.includes('onOpenPlan')) {
  console.error('LIVE-462: could not find the Open Plan handler; re-read this probe before trusting it')
  process.exit(79)
}
if (/if \(onOpenPlan && plan\)/.test(openPlan) || /onOpenPlan && plans\.find/.test(openPlan)) {
  fail(
    'the Open Plan button is gated on finding the Plan in the `plans` server prop. That prop is ' +
      'stale for the Plan the save just created, so the button silently does nothing on exactly ' +
      'the path it exists for. Pass input.planId straight to onOpenPlan, which takes an id.',
  )
}

console.log('✓ LIVE-462: no client refresh in the drawer, every write still revalidates the calendar routes, and Open Plan is not gated on a stale server prop.')

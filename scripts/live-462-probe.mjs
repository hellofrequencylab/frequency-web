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
// Not "is there a useEffect" — that is a spelling. It checks that no `router.refresh()` in this
// component sits inside a `startTransition` body, which is the property that makes the drawer
// freeze, and that the refresh still happens at all (a fix that simply deleted it would leave the
// month grid stale after every write, which is a worse bug wearing this one's clothes).
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

// 2. No router.refresh() inside a startTransition body. Bodies are matched by brace balance from
//    each `startTransition(` so a refresh nested in any branch of one is still caught.
for (const m of code.matchAll(/startTransition\(/g)) {
  let i = code.indexOf('{', m.index)
  if (i < 0) continue
  let depth = 0
  let end = i
  for (; end < code.length; end++) {
    if (code[end] === '{') depth++
    else if (code[end] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  const body = code.slice(i, end + 1)
  if (/router\.refresh\(\)/.test(body)) {
    fail(
      'router.refresh() is called inside a startTransition body. `pending` stays true until the ' +
        'transition commits and every drawer control is disabled={pending}, so a SUCCESSFUL save ' +
        'freezes the form until a full Server Component re-render returns. Refresh from an effect ' +
        'on refreshKey instead, outside the transition.',
    )
  }
  // Nor via a helper called in the transition that refreshes on its own behalf.
  for (const call of body.matchAll(/\b(\w+)\(\)/g)) {
    const helper = code.match(new RegExp(`const ${call[1]} = \\(\\) => \\{([\\s\\S]*?)\\n  \\}`))
    if (helper && /router\.refresh\(\)/.test(helper[1])) {
      fail(
        `${call[1]}() is called inside a startTransition body and calls router.refresh() itself, ` +
          'which puts the refresh back inside the transition by the back door and re-freezes the drawer.',
      )
    }
  }
}

// 3. The refresh must still happen. Deleting it would leave the month grid stale after every write.
if (!/router\.refresh\(\)/.test(code)) {
  fail('router.refresh() is gone entirely, so the month grid no longer reloads after a write — a worse bug than the one this row fixed')
}
if (!/useEffect\([\s\S]{0,200}?router\.refresh\(\)/.test(code)) {
  fail('router.refresh() no longer runs from an effect, so nothing guarantees it is outside the transition')
}

console.log('✓ LIVE-462: no router.refresh() inside a transition that gates the drawer, and the refresh still runs.')

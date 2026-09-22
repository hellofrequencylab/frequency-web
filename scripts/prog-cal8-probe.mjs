#!/usr/bin/env node
// PROG-CAL8 probe — "Make it a Production opens, for every target kind that promises a door".
//
// ── WHY THIS REPLACED THE 2026-09-21 REOPEN PROBE ───────────────────────────────────────────────
// The reopen probe was written to catch the defect it had just found, and it caught it by naming
// the broken strings: `journeys/new?space=${spaceId}`, `spaces/${spaceId}/settings`. That works
// exactly once. Change the interpolation to anything else — including something equally dead —
// and every arm goes quiet, because each one is guarded by "if the OLD text is still there".
//
// This measures the consequence instead. A door is open when two things are true of it:
//   1. the identifier it sends is the one its destination resolves, and
//   2. the route it names EXISTS on disk.
// Neither is a string the fix happened to leave behind; both stay true for any future rewrite and
// false for any future break.
//
// The original defect, for the record (verified against production 2026-09-21):
//   • JOURNEY was a dead door. `/journeys/new?space=${spaceId}` handed a UUID to a page that
//     resolves `?space=` with getVisibleSpaceBySlug (`.eq('slug', norm)`). It never matched, so the
//     page took its `!space` branch and `redirect('/spaces')` fired: the owner pressed "Make it a
//     Production" and landed on the Spaces directory. It also carried `&plan=` to a page that never
//     declared the parameter, so the Plan was lost even when the Journey did get made.
//   • PROGRAM was a 404. `/spaces/${spaceId}/settings` — a `[slug]` segment holding a UUID, and no
//     page.tsx at that segment at all, only a layout.
//   • EVENT worked, and MAINTENANCE declares `createHref: null` on purpose.
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

const plans = read('lib/calendar/plans.ts')
if (plans === null) {
  console.error('could not read lib/calendar/plans.ts')
  process.exit(79)
}

const fail = (m) => {
  console.error(`PROG-CAL8: ${m}`)
  process.exit(1)
}

const defs = plans.slice(plans.indexOf('export const PLAN_TARGET_DEFS'), plans.indexOf('export function planTargetDef'))
if (!defs) fail('PLAN_TARGET_DEFS is gone from lib/calendar/plans.ts')

// Each target's createHref body, keyed by kind, so an arm can speak about the door it means.
// Split on the `kind:` boundaries rather than matching a brace shape: the maintenance entry is
// written on one line and the event entry spans six, and a probe that only understands one of
// those layouts goes quiet the day someone reformats the file.
const hrefs = new Map()
const marks = [...defs.matchAll(/kind: '(\w+)'/g)]
for (let i = 0; i < marks.length; i++) {
  const slice = defs.slice(marks[i].index, i + 1 < marks.length ? marks[i + 1].index : defs.length)
  const at = slice.indexOf('createHref:')
  hrefs.set(marks[i][1], at < 0 ? '' : slice.slice(at + 'createHref:'.length).trim())
}
for (const kind of ['event', 'journey', 'program', 'maintenance']) {
  if (!hrefs.has(kind)) fail(`the ${kind} target is no longer declared in PLAN_TARGET_DEFS`)
}

// ── 1. NO UUID IN A [slug] SEGMENT ──────────────────────────────────────────────────────────────
// `/spaces/<seg>/...` is a `[slug]` route. A UUID there is a 404 by construction, whatever page
// sits behind it. This is the arm that would have caught the Program door on the day it shipped.
for (const [kind, body] of hrefs) {
  for (const seg of body.matchAll(/\/spaces\/\$\{(\w+)\}/g)) {
    if (seg[1] !== 'spaceSlug') {
      fail(
        `the ${kind} door builds /spaces/\${${seg[1]}}/... — that segment is [slug], so anything ` +
          `but spaceSlug is a 404. Hand it the slug, or teach the route to resolve an id.`,
      )
    }
  }
}

// ── 2. /journeys/new IS RESOLVED BY SLUG ────────────────────────────────────────────────────────
const journey = hrefs.get('journey')
if (journey !== 'null') {
  const page = read('app/(main)/journeys/new/page.tsx')
  if (page === null) fail('app/(main)/journeys/new/page.tsx is gone, but the journey door still points at it')
  const bySlug = /getVisibleSpaceBySlug\(/.test(page)
  const spaceParam = journey.match(/\/journeys\/new\?space=\$\{(\w+)\}/)?.[1]
  if (!spaceParam) fail('the journey door no longer sends ?space= at all, so the Journey cannot be stamped to the Space')
  if (bySlug && spaceParam !== 'spaceSlug') {
    fail(
      `the journey door sends ?space=\${${spaceParam}} while /journeys/new resolves it with ` +
        `getVisibleSpaceBySlug. A UUID never matches a slug: the page redirects to /spaces and the ` +
        `owner lands on the Spaces directory instead of the Journey builder.`,
    )
  }
  // ── 3. AND THE PLAN REACHES THE PAGE ──────────────────────────────────────────────────────────
  // Both ends, because they broke independently: the href sent `&plan=` for three days to a page
  // that had no such parameter.
  if (/[?&]plan=/.test(journey)) {
    const declares = (src) => /searchParams: Promise<\{[^}]*\bplan\?: string/.test(src)
    if (!declares(page)) {
      fail('the journey door sends &plan= and /journeys/new does not declare plan in its searchParams, so the Journey opens holding nothing of the Plan')
    }
    const modal = read('app/(main)/@wizard/(.)journeys/new/page.tsx')
    if (modal !== null && !declares(modal)) {
      fail('the @wizard interceptor above /journeys/new types plan away while forwarding searchParams verbatim, so the modal road — the one the Plan board actually opens — loses the Plan')
    }
  }
}

// ── 4. EVERY DOOR NAMES A ROUTE THAT EXISTS ─────────────────────────────────────────────────────
// The Program door pointed at `/spaces/<id>/settings`, a segment that holds a layout and no page.
const routeFile = (path) => {
  const segs = path.split('?')[0].split('/').filter(Boolean)
  // Map a concrete URL back onto the app tree, standing dynamic values back up as their segment.
  const app = ['app', '(main)']
  const known = {
    events: ['events'],
    journeys: ['journeys'],
    spaces: ['spaces', '[slug]'],
  }
  const head = known[segs[0]]
  if (!head) return null
  const tail = segs[0] === 'spaces' ? segs.slice(2) : segs.slice(1)
  return [...app, ...head, ...tail, 'page.tsx'].join('/')
}
for (const [kind, body] of hrefs) {
  if (body === 'null') continue
  const literal = body.match(/`([^`]+)`/)?.[1]
  if (!literal) continue
  const concrete = literal.replace(/\$\{[^}]+\}/g, 'x')
  const file = routeFile(concrete)
  if (file && !existsSync(file)) {
    fail(`the ${kind} door opens ${literal}, and there is no page at ${file}. The button 404s.`)
  }
}

// ── 5. THE JOURNEY THAT COMES OUT CARRIES THE PLAN ──────────────────────────────────────────────
// A door that opens onto a create flow which drops the Plan is the same defect one screen later.
const create = read('app/(main)/journeys/create-actions.ts')
if (create === null) fail('app/(main)/journeys/create-actions.ts is gone')
const code = create.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const calls = [...code.matchAll(/createPlan\(/g)]
if (calls.length < 4) fail(`expected the four create roads to call createPlan; found ${calls.length}`)
for (const m of calls) {
  if (!code.slice(m.index, m.index + 320).includes('spacePlanId: ctx.spacePlanId')) {
    fail('a create road calls createPlan without spacePlanId, so a Journey produced from a Plan on that road carries no link back to it')
  }
}
if (!/getSpacePlan\(space\.id,/.test(code)) {
  fail('create-actions takes the ?plan= id on the query string’s word: it must be authorized against the Space through getSpacePlan, which reads on the caller’s own session')
}
const store = read('lib/journey-plans.ts') ?? ''
if (!store.includes('space_plan_id: input.spacePlanId')) {
  fail('createPlan does not put space_plan_id on the INSERT, so the back-link depends on a second write that can fail silently')
}

console.log('✓ PROG-CAL8: every Production door sends the identifier its destination resolves, names a route that exists, and the Journey road carries its Plan through to the row.')

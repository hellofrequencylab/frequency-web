#!/usr/bin/env node
// LIVE-2319: an event created from a Space calendar returns to that calendar once published, not to
// the main Events page. Checks the consequence in source:
//   1. A validator exists that only lets a same-origin /spaces/ path through.
//   2. /events/new reads `?return=` through it and hands it to the form.
//   3. After a create, the form pushes the validated return path before falling back to the event.
//   4. The Space calendar create doors (the calendar console's new-event link, the Go live door and the
//      Plan board's event door) carry `return=`.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

const helperPath = 'lib/events/return-path.ts'
if (!existsSync(new URL(helperPath, root))) {
  fails.push(`${helperPath} is missing (no validator for the return path)`)
} else {
  const helper = read(helperPath)
  if (!/export function safeReturnPath/.test(helper)) fails.push('no safeReturnPath export')
  if (!/\^\\\/spaces\\\//.test(helper)) fails.push('safeReturnPath does not pin the path to /spaces/')
  if (!/startsWith\('\/\/'\)/.test(helper)) fails.push('safeReturnPath does not refuse a protocol-relative //host')
}

const page = read('app/(main)/events/new/page.tsx')
if (!/safeReturnPath\(returnParam\)/.test(page) || !/returnTo=\{returnTo\}/.test(page)) {
  fails.push('/events/new does not validate ?return= and pass it on')
}
const spark = read('app/(main)/events/event-spark.tsx')
if (!/returnTo=\{returnTo\}/.test(spark)) fails.push('EventSpark does not pass returnTo to the manual form')

const form = read('app/(main)/events/new/event-form.tsx')
if (!/safeReturnPath\(returnTo\)/.test(form) || !/router\.push\(back \?\? `\/events\/\$\{res\.data\.slug\}`\)/.test(form)) {
  fails.push('the event form still always pushes /events/<slug> after a create')
}

const consolePage = read('app/(main)/spaces/[slug]/settings/calendar/page.tsx')
if (!/newEventHref = withReturnPath\(/.test(consolePage)) fails.push('the calendar console new-event link carries no return path')
const door = read('lib/calendar/stage-timeline.ts')
if (!/return withReturnPath\(`\/events\/new\?/.test(door)) fails.push('the Go live door (productionDoorHref) carries no return path')
const plans = read('lib/calendar/plans.ts')
if (!/withReturnPath\(`\/events\/new\?\$\{q\.toString\(\)\}`, `\/spaces\/\$\{spaceSlug\}/.test(plans)) {
  fails.push('the Plan board event door carries no return path')
}
const suite = read('components/calendar-suite/calendar-suite.tsx')
if (!/returnTo: `\/spaces\/\$\{slug\}\/settings\/calendar`/.test(suite)) fails.push('the calendar suite does not hand its Go live doors a return path')
// The staff calendar's own publish door retired with it (SCAN-1345, 2026-11-27); the team calendar's
// Details panel is the door now, and it hands productionDoorHref the suite's return path.
const details = read('components/calendar-suite/suite-details.tsx')
if (!/productionDoorHref\(ctx\.ownSpaceId, item\.entryId, item\.plan, ctx\.returnTo\)/.test(details)) {
  fails.push('the team calendar Go live door (suite-details.tsx) does not pass the return path to productionDoorHref')
}

if (fails.length) {
  console.error(`LIVE-2319 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2319 ok: a create started from a Space calendar returns there once published')

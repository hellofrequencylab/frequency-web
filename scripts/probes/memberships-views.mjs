// LIVE-1176 probe: the Memberships tab is five views (Plans, Benefits, Circles, Event access, Members), one
// open at a time, and a long event list folds behind Show all, instead of one stack of every editor.
//
//   node scripts/probes/memberships-views.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const catalog = readFileSync('lib/spaces/offerings.ts', 'utf8')
assert.match(catalog, /MEMBERSHIP_VIEWS/, 'the view list lives in the offerings catalog')
const section = readFileSync('app/(main)/spaces/[slug]/settings/memberships/section.tsx', 'utf8')
assert.match(section, /<MembershipViews /, 'the section renders the view bar')
assert.match(section, /open === 'events'/, 'the event list only loads on its own view')
assert.doesNotMatch(section, /const editors = \(/, 'the editors no longer stack in one body')
const events = readFileSync('components/spaces/membership-event-access.tsx', 'utf8')
assert.match(events, /EVENTS_SHOWN/, 'the event list folds behind Show all')
console.log('PASS memberships-views')

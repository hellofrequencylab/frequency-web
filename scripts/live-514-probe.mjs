#!/usr/bin/env node
// LIVE-514 probe — "twenty-five Royal Temple dates drew at 1:30 AM; the wall clock / instant
// confusion is repaired, named and pinned".
//
// WHAT IT MEASURES, and why it is not a grep for four strings. The consequence of this row is an
// AGREEMENT between three things that can drift apart silently: the SQL that moved the rows, the
// TypeScript that names the same shift, and the stored strings both must produce. So the probe
// DERIVES the expected value itself, from the tz database via Intl, and then asks whether the tree
// still encodes it — rather than quoting a value the tree could have changed underneath it.
//
// It also guards the two ways this comes back: the repair being re-scoped to a Space (which would
// make it unprovable, and would move a legitimate late-night date on a fresh replay), and
// `parseEntryInput` — the one writer of a stored calendar time — learning to resolve a zone.
//
// Exit 0 = done, 1 = not done.

import { readFileSync } from 'node:fs'

const fail = (m) => {
  console.error(m)
  process.exit(1)
}
const rd = (f) => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return null
  }
}
// Derive the repair INDEPENDENTLY of the tree: read the stored value as a true instant in the
// Space's zone and ask Intl what wall clock it shows. That is the value both the migration and
// lib/calendar/wall-clock.ts have to produce, and it is computed here rather than quoted.
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date('2026-10-24T01:30:00.000Z'))
const g=(t)=>parts.find(p=>p.type===t).value
const meant=`${g('year')}-${g('month')}-${g('day')}T${g('hour')==='24'?'00':g('hour')}:${g('minute')}:00.000Z`
if(meant!=='2026-10-23T18:30:00.000Z')fail('the tz database moved under this probe: '+meant)
const M=rd('lib/calendar/wall-clock.ts')
if(M===null)fail('lib/calendar/wall-clock.ts is gone, so nothing names the wall-clock/instant distinction')
for(const sym of ['instantShapedSpan','wallClockOfInstant','instantShapedSeriesTell'])
  if(!M.includes(`export function ${sym}`))fail(`wall-clock.ts no longer exports ${sym}`)
const T=rd('lib/calendar/wall-clock.test.ts')
if(T===null)fail('lib/calendar/wall-clock.test.ts is gone, so no test pins a stored string')
if(!T.includes(`'${meant}'`))fail(`the test no longer pins ${meant}, the wall clock the repaired rows must hold`)
if(!T.includes("'2026-10-24T01:30:00.000Z'"))fail('the test no longer holds the instant-shaped value it must reject')
const rows=(T.match(/\n  \['[^\n]*'\],/g)||[]).length
if(rows!==25)fail(`the production fixture table holds ${rows} rows, not the 25 LIVE-514 repaired`)
const SQL=rd('supabase/migrations/20270345008500_calendar_entries_stored_as_instants.sql')
if(SQL===null)fail('the repair migration is gone')
const body=SQL.slice(SQL.indexOf('do $$'))
if(body.length<50)fail('the repair migration has no statement left')
if(/slug\s*=/.test(body))fail('the repair is scoped to a Space again instead of to rows that are provably instant-shaped')
if(!/set starts_at = \(\(e\.starts_at at time zone e\.time_zone\) at time zone 'UTC'\)/.test(body))fail('the repair no longer re-reads the stored instant as its own local wall clock')
if(/\binterval\b/.test(body))fail('the repair shifts by a fixed interval, which cannot be right across a DST boundary')
for(const cond of ["not e.all_day","time '06:00'","time '16:00'","% 15 = 0"])
  if(!body.includes(cond))fail(`the repair predicate dropped its "${cond}" condition and now selects rows it cannot prove`)
const E=rd('lib/calendar/entries.ts')
if(E===null)fail('lib/calendar/entries.ts is gone')
const from=E.indexOf('export function parseEntryInput')
if(from<0)fail('parseEntryInput is gone, so the one writer of a stored calendar time has moved')
const after=E.indexOf('\nexport ',from+1)
const writer=E.slice(from,after<0?E.length:after)
if(/eventInstant|zonedWallClockToInstant|resolveZone/.test(writer))fail('parseEntryInput resolves a zone now, so the one writer can store an instant')
if(!/starts_at: new Date\(startsMs\).toISOString\(\)/.test(writer))fail('parseEntryInput no longer composes starts_at from wall-clock parts')
console.log('ok')

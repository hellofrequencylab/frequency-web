#!/usr/bin/env node
// prove-it — the three numbers CORE-MODEL §5 phase 11 says are the only ones that are not a guess.
// (PROG-R11, ADR-1510)
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// The core model (ADR-1294) is three lines and four nouns, and every number in it is a guess until
// three move: how many circles a Space starts, how many gatherings are actually held, and how many
// people are in the room. Phase 11 is a six-week field test that reads those three at the start
// and at the end. It needs no engineer, but it needs an instrument, and until this file the
// instrument was "someone writes a query", which is a different query every time it is written.
//
// This is the query, written once, with its definitions beside it.
//
// ── WHAT IT MEASURES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────────────────
// One SELECT, three numbers, each from a record that money and the game cannot touch:
//
//   1. CIRCLES PER SPACE. Listable circles (forming or active, not demo) that a Space STARTED,
//      over active non-root Spaces. 🔴 The Space Circle every Space is provisioned with
//      (`circles.is_space_primary`, ADR-1391) is NOT counted: it exists because a trigger made it,
//      so counting it would make the number move on provisioning instead of on behaviour. The
//      denominator is the population the standing rollup scores (lib/spaces/standing-rollup.ts):
//      active Spaces that are not the personal root.
//   2. GATHERINGS HELD, in the trailing window. Published, not cancelled, not removed, not demo,
//      and the start has passed. That is the claim the data can stand behind, and it is the same
//      definition `space_standing.gatherings_held` uses. Beside it, the subset where a host marked
//      at least one person present, so "on the calendar and past" and "someone was in the room"
//      are never read as the same fact.
//   3. ATTENDANCE, in the trailing window. Seats a HOST marked present: `attended_at` on
//      `event_rsvps` and on `event_tickets`, the two seat tables (PROG-GD4, ADR-1332).
//
// 🔴 THE ENGAGEMENT LEDGER IS NEVER READ. Before PROG-GD4 the only trace of attendance was the
// `practice.verified` row that the self check-in writes on the path that pays Zaps, which meant
// "attended" and "was paid for attending" were one fact and demoting the game would have deleted
// the metric. The host mark is independent of that path and pays nobody, so this reading survives
// any decision about the game. The backlog probe fails the build if a ledger table name appears
// in the query.
//
// The window is 42 days, the length of the field test, so the end-of-test reading is the test.
// Circles per Space is a stock and is not windowed.
//
// ── IT IS A READING, NEVER A GATE ───────────────────────────────────────────────────────────
// There is no threshold and no verdict: nobody has decided what a good number is, and a gate
// with an invented target is a gate people learn to ignore (ADR-970). Exit codes only say
// whether a reading happened:
//
//   exit 0   a reading was taken and printed
//   exit 79  INDETERMINATE: no payload, or a payload that carried no reading
//   exit 2   usage error (no argument at all)
//
// Usage:
//   node scripts/maintenance/prove-it.mjs --print-query      # the SQL for the fetch step
//   node scripts/maintenance/prove-it.mjs proveit.json       # read a fetched payload, report
//   node scripts/maintenance/prove-it.mjs --payload '<json>' # same, from an inline payload
//
// Same division of labour as db-usage.mjs beside it: the weekly sweep (or a person with the SQL
// editor, or an agent with the Supabase MCP) performs the credentialled read, this script never
// touches a database, and the probe drives every arm through `--payload`.

import { readFileSync } from 'node:fs'

/** Who reads this. Named in the report, because a reading nobody owns is a reading nobody acts
 *  on (ADR-1326). The field test is an owner-timed row; the sweep only keeps the series. */
export const OWNER = 'the phase 11 field test (LIVE-455) and the weekly maintenance sweep summary'

/** The trailing window for gatherings and attendance: the field test is six weeks long. */
export const WINDOW_DAYS = 42

/**
 * One SELECT, one row, one JSON object called `reading`. Runs as the service role or in the SQL
 * editor; every table it names is one the roster and the directory already read.
 */
export const PROVE_IT_QUERY = `
with spaces as (
  select count(*) as n
    from public.spaces s
   where s.status = 'active'
     and s.type <> 'root'
),
circles as (
  -- Circles a Space STARTED. The provisioned Space Circle (is_space_primary) is not one of them.
  select count(*) as n
    from public.circles c
   where c.space_id is not null
     and not c.is_space_primary
     and not c.is_demo
     and c.status in ('forming', 'active')
),
held as (
  -- Published, not cancelled, not removed, not demo, and the start has passed, inside the window.
  select e.id
    from public.events e
   where e.status = 'published'
     and coalesce(e.is_cancelled, false) = false
     and e.removed_at is null
     and not e.is_demo
     and e.starts_at < now()
     and e.starts_at >= now() - make_interval(days => ${WINDOW_DAYS})
),
marks as (
  -- Seats a HOST marked present: the independent record. Never the engagement ledger.
  select r.event_id from public.event_rsvps r where r.attended_at is not null
  union all
  select t.event_id from public.event_tickets t where t.attended_at is not null
)
select json_build_object(
  'asOf', now(),
  'windowDays', ${WINDOW_DAYS},
  'spaces', (select n from spaces),
  'circles', (select n from circles),
  'gatheringsHeld', (select count(*) from held),
  'gatheringsAttested', (select count(*) from held h where exists (select 1 from marks m where m.event_id = h.id)),
  'attendance', (select count(*) from marks m where exists (select 1 from held h where h.id = m.event_id))
) as reading;
`.trim()

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * Pull the reading out of whatever shape the payload arrived in, or return null.
 *
 * 🔴 NULL IS THE INDETERMINATE SIGNAL. An empty array, a Management API error envelope, a
 * truncated body, a `{}`, and a payload that carries some other count where attendance should be
 * all land here. A reading with a hole in it is not a reading with a zero in it.
 */
export function parseReading(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const rows = Array.isArray(parsed) ? parsed : (parsed?.result ?? parsed?.rows ?? [])
  const row = Array.isArray(rows) ? rows[0] : null
  const r = row?.reading ?? row
  if (!r || typeof r !== 'object') return null
  const spaces = num(r.spaces)
  const circles = num(r.circles)
  const gatheringsHeld = num(r.gatheringsHeld)
  const gatheringsAttested = num(r.gatheringsAttested)
  const attendance = num(r.attendance)
  // All three numbers or none: a partial reading printed beside two full ones would be read as a
  // zero on the missing one, which is the shape-not-truth failure this repo names.
  if (spaces === null || circles === null || gatheringsHeld === null || gatheringsAttested === null || attendance === null) return null
  return {
    asOf: typeof r.asOf === 'string' ? r.asOf : null,
    windowDays: num(r.windowDays) ?? WINDOW_DAYS,
    spaces,
    circles,
    circlesPerSpace: spaces > 0 ? circles / spaces : null,
    gatheringsHeld,
    gatheringsAttested,
    attendance,
  }
}

const int = (n) => (n === null ? '?' : n.toLocaleString('en-US'))
const ratio = (n) => (n === null ? 'no Spaces to divide by' : n.toFixed(2))

/** The markdown a reading becomes. A reading of zero still prints its numbers, because the whole
 *  value of the series is the series. */
export function report(reading) {
  const w = reading.windowDays
  const lines = [
    `**Circles per Space** — ${ratio(reading.circlesPerSpace)} (${int(reading.circles)} circles a Space started, across ${int(reading.spaces)} Spaces; the provisioned Space Circle is not counted)`,
    `**Gatherings held** — ${int(reading.gatheringsHeld)} in the last ${w} days (published, not cancelled, date passed); ${int(reading.gatheringsAttested)} of them with anyone marked present`,
    `**Attendance** — ${int(reading.attendance)} people marked present by a host in the last ${w} days (the host mark on the seat; the Zap ledger is not read)`,
    '',
    `As of ${reading.asOf ?? 'an unstated time'}. No threshold and no verdict: these are the three numbers every other number in CORE-MODEL is a guess until, and they are read as a series.`,
    `OWNER: ${OWNER}.`,
  ]
  return { code: 0, text: lines.join('\n') }
}

/** What gets printed when the read did not happen. NEVER a reading of zero. */
export function indeterminate(why) {
  return {
    code: 79,
    text: [
      `🔴 **Could not look** — ${why}`,
      '',
      'This is NOT a reading. The three phase 11 numbers were not measured on this run, so nothing',
      'here says they held or moved (ADR-970: a read that failed is not a read that agreed).',
      `OWNER: ${OWNER}.`,
    ].join('\n'),
  }
}

function main(argv) {
  if (argv.includes('--print-query')) {
    console.log(PROVE_IT_QUERY)
    return 0
  }
  const i = argv.indexOf('--payload')
  const inline = i >= 0 ? argv[i + 1] : undefined
  const file = argv.find((a) => !a.startsWith('--') && a !== inline)
  if (inline === undefined && !file) {
    console.error('usage: prove-it.mjs <proveit.json> | --payload <json> | --print-query')
    return 2
  }
  let raw
  try {
    raw = inline !== undefined ? inline : readFileSync(file, 'utf8')
  } catch (e) {
    const r = indeterminate(`the payload could not be read: ${e instanceof Error ? e.message : String(e)}`)
    console.log(r.text)
    return r.code
  }
  let reading
  try {
    reading = parseReading(raw)
  } catch (e) {
    const r = indeterminate(`the payload did not parse as JSON: ${e instanceof Error ? e.message : String(e)}`)
    console.log(r.text)
    return r.code
  }
  const r = reading
    ? report(reading)
    : indeterminate('the payload carried no reading (an API error envelope, an empty result, or a count missing)')
  console.log(r.text)
  return r.code
}

if (process.argv[1] && process.argv[1].endsWith('prove-it.mjs')) process.exit(main(process.argv.slice(2)))

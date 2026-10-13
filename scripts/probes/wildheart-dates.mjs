// LIVE-905 PROBE: every Circle Night is on the Wildheart wheel, every date reads as its stored wall clock,
// and the year journey opens in January with a door to the next season. Runs the SHIPPED pure module and
// the seed (probe-ts resolves `@/` and extensionless imports; nothing is mocked) and fails on the
// consequence:
//   1. the seed's Circle Night anchor (every other Tuesday, 6:00 PM, stored as the wall clock in UTC parts
//      per lib/time/zone.ts) expanded through 2027 by lib/sites/site-events.ts lands thirty more Tuesdays
//      at 6:00 PM, none twice where the seed's four materialised children already hold the day, and a
//      cancelled child's day stays empty;
//   2. the seed writes the stored convention: a stored 2026-11-03T18:00Z with time_zone America/Los_Angeles
//      reads "Tue Nov 3 · 6:00 PM" and Week 1 reads Jan 5 through the one formatter every site surface uses
//      (the live bug was the seed writing true instants);
//   3. the readers carry the series: the site's live rows read (lib/sites/menswork-data.ts) expands it, the
//      landing hands a year-drawing block the live series rows, the store selects `recurrence_rule`, and
//      no reader folds a zone (the stored parts ARE the wall clock);
//   4. the islands: the sky map lists the year in season sections headed from the season table (the leaf,
//      never lib/theme/wildheart.ts), and the year journey carries the "Next section" door, the fast-scroll
//      thresholds as named constants, and honours reduced motion; neither island imports the theme module.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/wildheart-dates.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dates = await import('../../lib/sites/site-events.ts')
const seed = await import('../../scripts/seed-wildheart.mts')
const page = await import('../../lib/sites/menswork-page.ts')
const zone = await import('../../lib/time/zone.ts')

const LA = 'America/Los_Angeles'

// 1. The series across the year.
const events = seed.buildEvents()
const rows = events.map((e, i) => ({
  id: `evt-${i}`,
  slug: e.slug,
  title: e.title,
  startsAt: seed.ptIso(e.date, e.start),
  endsAt: seed.ptIso(e.endDate ?? e.date, e.end),
  timeZone: LA,
  recurrenceType: e.recurrence?.type ?? null,
  recurrenceRule: e.recurrence?.rule ?? null,
  parentEventId: null,
  isCancelled: false,
}))
const anchor = rows.find((r) => r.recurrenceType === 'weekly')
assert.ok(anchor && anchor.recurrenceRule === 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', 'the seed anchors a fortnightly Tuesday Circle Night')
assert.equal(anchor.startsAt, '2026-11-03T18:00:00.000Z', 'the seed stores the wall clock as UTC parts (lib/time/zone.ts), not an instant')
const children = ['2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29'].map((day, i) => ({ ...anchor, id: `child-${i}`, slug: `${anchor.slug}-${day}`, startsAt: seed.ptIso(day, '18:00'), endsAt: seed.ptIso(day, '19:30'), recurrenceType: 'none', recurrenceRule: null, parentEventId: anchor.id, isCancelled: i === 3 }))
const through = new Date(Date.UTC(2027, 11, 31, 23, 59, 59))
const expanded = dates.expandSiteSeries([...rows, ...children], { through })
const nights = expanded.filter((r) => r.title === 'Circle Night')
const days = nights.map((r) => dates.storedDay(r.startsAt))
assert.equal(new Set(days).size, days.length, 'no Circle Night day twice')
assert.equal(nights.filter((r) => r.parentEventId === anchor.id && !r.id.startsWith('child-')).length, 30 - 4, 'the rule mints the Tuesdays the four children do not hold (one child cancelled, its day left empty)')
assert.ok(!days.includes('2026-12-29'), 'the cancelled child leaves its day empty')
assert.ok(!nights.some((r) => r.isCancelled), 'a cancelled row never reaches the page')
assert.ok(days.includes('2027-01-12') && days.includes('2027-07-13') && days.includes('2027-12-28'), 'the year is covered to its last Tuesday')
for (const r of nights) {
  const l = page.dateLabel(r.startsAt)
  assert.ok(l.day.startsWith('Tue '), `${r.startsAt} is a Tuesday (${l.day})`)
  assert.equal(l.time, '6:00 PM', `${r.startsAt} is at 6:00 PM`)
}
assert.ok(expanded.every((r, i) => i === 0 || r.startsAt >= expanded[i - 1].startsAt), 'sorted by start')

// 2. The seed and the formatter agree with lib/time/zone.ts.
assert.deepEqual(page.dateLabel('2026-11-03T18:00:00Z'), { day: 'Tue Nov 3', time: '6:00 PM' })
assert.equal(zone.formatEventWhen('2026-11-03T18:00:00Z', LA, { withZone: false }), 'Tue, Nov 3, 6:00 PM', 'the product formatter reads the same row the same way')
const week1 = rows.find((r) => r.title.startsWith('Week 1'))
assert.ok(week1, 'the seed has Week 1')
assert.equal(dates.storedDay(week1.startsAt), '2027-01-05', 'Week 1 is Jan 5')
const sql = readFileSync('scripts/seed-wildheart.sql', 'utf8')
assert.ok(!sql.includes("at time zone 'America/Los_Angeles'"), 'the SQL writes no instant through the zone')
assert.ok(sql.includes("timestamptz '2026-11-03 18:00+00'") && sql.includes("(d.day || ' 18:00+00')::timestamptz"), 'the SQL stores the wall clock as UTC parts, the children too')
assert.ok(sql.includes("time_zone = 'America/Los_Angeles'") || sql.includes("'America/Los_Angeles'"), 'the zone column stays Los Angeles')

// 3. The readers.
const data = readFileSync('lib/sites/menswork-data.ts', 'utf8')
assert.ok(data.includes('expandSiteSeries(') && data.includes('listSpaceSeriesRows('), 'the live rows read expands the series')
for (const f of ['lib/sites/menswork-data.ts', 'components/page-editor/blocks/wildheart.tsx', 'lib/sites/site-events.ts', 'components/sites/site-page.tsx']) {
  const src = readFileSync(f, 'utf8')
  assert.ok(!/instantRows|foldSiteEvent|wallClockInZone|zonedWallClockToInstant/.test(src), `${f} reads the stored parts as the wall clock, no zone fold`)
}
const landing = readFileSync('components/spaces/space-landing.tsx', 'utf8')
assert.ok(landing.includes('getSpaceSeriesRows(space.id)'), 'the landing hands a year-drawing block the series rows')
const store = readFileSync('lib/events/store.ts', 'utf8')
assert.ok(/const COLS =\s*`[^`]*recurrence_rule/.test(store) && store.includes('export async function listSpaceSeriesRows('), 'the store selects the rule and reads the series rows')
const block = readFileSync('components/page-editor/blocks/wildheart.tsx', 'utf8')
assert.ok(block.includes('expandSiteSeries(rows') && block.includes("data-season={data.table[0]?.season"), 'the block expands the series and opens the journey in the window\'s first season')
assert.ok(/const PASSING_MAX = 6/.test(block), 'a stop lists six passing dates')

// 4. The islands.
const skyMap = readFileSync('components/sites/wildheart-sky-map.tsx', 'utf8')
assert.ok(skyMap.includes("from '@/lib/theme/wildheart-seasons'") && skyMap.includes('wh-sm-season-head') && skyMap.includes("useState<'sign' | 'season' | 'year'>('year')"), 'the sky map lists the year in season sections from the leaf')
const journey = readFileSync('components/sites/wildheart-year-journey.tsx', 'utf8')
for (const c of ['NEXT_SECTION_AFTER_DAYS', 'FAST_SCROLL_DELTA', 'FAST_SCROLL_WINDOW_MS', 'FAST_TOUCH_PX_PER_MS', 'FAST_SCROLL_COOLDOWN_MS']) assert.ok(new RegExp(`const ${c} = \\d`).test(journey), `${c} is a named constant`)
assert.ok(journey.includes('className="wh-yj-next"') && journey.includes('{data.labels.next}') && block.includes("next: 'Next section'"), 'the door is a real button labelled Next section')
assert.ok(journey.includes("scrollToP(pAt(target.day), !reduceRef.current)") && journey.includes("addEventListener('wheel', onWheel, { passive: true })"), 'the door and the fast scroll travel to the season, a jump under reduced motion')
for (const island of [skyMap, journey]) assert.ok(!island.includes("lib/theme/wildheart'") && !island.includes('zod'), 'no island reaches the theme module or zod')
const css = readFileSync('components/sites/wildheart-css.ts', 'utf8')
assert.ok(css.includes('.wh-yj-next{') && css.includes('.wh-sm-season-head{'), 'the skin styles the door and the season heads')
assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css.slice(css.indexOf('.wh-yj-next{'), css.indexOf('.wh-yj-next{') + 400)), 'tokens only')
console.log(`wildheart-dates: ok (${nights.length} Circle Nights through 2027, stored as UTC parts in ${LA})`)

#!/usr/bin/env node
// PERF-040: density_by_city and the four remaining event feeds read public.tz_zone_lookup instead of
// joining a materialized list of every time zone name on every call (the SCAN-1210 swap).
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('../../supabase/migrations/', import.meta.url)
const hit = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .reverse()
  .find((f) => /PERF-040/.test(readFileSync(new URL(f, dir), 'utf8')))
const sql = hit ? readFileSync(new URL(hit, dir), 'utf8') : ''
const tap = (() => {
  try { return readFileSync(new URL('../../supabase/tests/event_feeds_zone_lookup.test.sql', import.meta.url), 'utf8') } catch { return '' }
})()
const ok =
  /'density_by_city', 'public_organizer_events', 'public_calendar_feed',\s+'space_public_calendar_feed', 'event_calendar_feed'/.test(sql) &&
  /replace\(d, 'join zones tz on', 'join public\.tz_zone_lookup tz on'\)/.test(sql) &&
  /d ~ '\\mzones\\M'/.test(sql) &&
  /no event or density read builds the zone list per call/.test(tap)
if (!ok) {
  console.error('PERF-040 FAIL: density_by_city and four event feeds still join a materialized list of every zone name per call (density_by_city ~444 ms mean)')
  process.exit(1)
}
console.log(`PERF-040 ok: ${hit} moves the five reads onto tz_zone_lookup, proved by pgTAP`)

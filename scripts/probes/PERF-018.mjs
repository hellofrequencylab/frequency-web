#!/usr/bin/env node
// PERF-018: the event_ticket_types read policy asks about one event (correlated EXISTS), not the
// whole events table (`event_id in (select ... from events)`), which cost every tier read a scan of
// every visible event and was the busiest statement in pg_stat_statements.
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('../../supabase/migrations/', import.meta.url)
const last = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .reverse()
  .find((f) => /create policy "read tiers for visible events"/.test(readFileSync(new URL(f, dir), 'utf8')))
const sql = last ? readFileSync(new URL(last, dir), 'utf8') : ''
const body = sql.slice(sql.indexOf('create policy "read tiers for visible events"'))
if (!/using \(exists \(select 1 from public\.events ev where ev\.id = event_ticket_types\.event_id\)\)/.test(body)) {
  console.error(`PERF-018 FAIL: ${last ?? 'no migration'} defines the tier read policy as an IN over every event, so each tier read scans the whole events table`)
  process.exit(1)
}
console.log(`PERF-018 ok: ${last} reads one event per tier (correlated EXISTS)`)

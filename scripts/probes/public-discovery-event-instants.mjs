import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql = readFileSync('supabase/migrations/20270346024600_public_discovery_event_instants.sql', 'utf8')
const functions = ['public_events', 'density_by_city', 'public_calendar_feed', 'space_public_calendar_feed', 'event_calendar_feed', 'public_organizer_events']
for (const name of functions) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0, `${name} definition is missing`)
  const next = sql.indexOf('create or replace function', start + 1)
  const block = sql.slice(start, next < 0 ? undefined : next).replace(/--[^\n]*/g, '')
  assert.match(block, /zones as materialized/, `${name} must resolve zones once per query`)
  assert.match(block, /at time zone 'UTC'/, `${name} must interpret stored wall-clock parts`)
  assert.doesNotMatch(block, /e\.starts_at\s*>=\s*now\(\)/, `${name} still compares raw storage to now`)
  assert.match(block, /revoke execute/, `${name} role contract is missing`)
}
assert.match(sql, /e\.visibility = 'public'/)
assert.match(sql, /s\.visibility = 'network'/)
assert.match(sql, /e\.removed_at is null/)
assert.match(sql, /sh\.status = 'accepted'/)
assert.match(sql, /approval_status is distinct from 'pending'/)
assert.match(sql, /case when e\.hide_address/)
assert.match(sql, /order by \(\(feed\.starts_at at time zone 'UTC'\) at time zone feed\.time_zone\)/)
console.log('Six event readers retain timezone conversion, bounded roles and their privacy/admission gates; executable pgTAP verifies consequences.')

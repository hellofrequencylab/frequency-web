#!/usr/bin/env node
// SEC-027: a member cannot take a free seat on a ticketed event by RSVPing "going".
// Before this row neither setRsvpStatus nor the event_rsvps policy or member write guard asked about
// price, so a member could write their own row to 'going' and isAdmitted() counted it as a seat.
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('../../supabase/migrations/', import.meta.url)
const hit = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .reverse()
  .find((f) => /create trigger trg_b_event_rsvps_ticket_seat/.test(readFileSync(new URL(f, dir), 'utf8')))
const sql = hit ? readFileSync(new URL(hit, dir), 'utf8') : ''
const tap = (() => {
  try { return readFileSync(new URL('../../supabase/tests/event_rsvps_ticket_seat_guard.test.sql', import.meta.url), 'utf8') } catch { return '' }
})()
const ok =
  /before insert or update on public\.event_rsvps/.test(sql) &&
  /new\.status in \('going', 'waitlist'\)/.test(sql) &&
  /new\.from_ticket_id is null/.test(sql) &&
  /private\.event_sells_tickets\(new\.event_id, new\.profile_id\)/.test(sql) &&
  /revoke all on function public\.guard_event_rsvp_ticket_seat\(\) from public, anon, authenticated/.test(sql) &&
  /a member cannot RSVP going to a ticketed event/.test(tap) &&
  /a free event still takes a member RSVP/.test(tap)
if (!ok) {
  console.error('SEC-027 FAIL: no trigger refuses a member RSVP of going or waitlist on a ticketed event, so a member can take a free seat (and the hidden address and online link) without a ticket')
  process.exit(1)
}
console.log(`SEC-027 ok: ${hit} refuses a free seat on a ticketed event, proved by pgTAP`)

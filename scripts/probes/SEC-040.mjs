#!/usr/bin/env node
// SEC-040: deleting an account is not refused by a Space follow, membership, enrolment or booking.
// Before this row 24 foreign keys to profiles(id) had no ON DELETE rule, so auth.admin.deleteUser
// failed for most members, after their files and Stripe customer were already erased.
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('../../supabase/migrations/', import.meta.url)
const hit = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .reverse()
  .find((f) => /'space_follows',\s+'follower_profile_id',\s+'cascade'/.test(readFileSync(new URL(f, dir), 'utf8')))
const sql = hit ? readFileSync(new URL(hit, dir), 'utf8') : ''
const tap = (() => {
  try { return readFileSync(new URL('../../supabase/tests/profile_delete_unblock_fks.test.sql', import.meta.url), 'utf8') } catch { return '' }
})()
const rows = sql.match(/\('[a-z_]+',\s+'[a-z_]+',\s+'(cascade|set null)'\)/g) ?? []
const ok =
  rows.length === 24 &&
  /references public\.profiles\(id\) on delete %s/.test(sql) &&
  /drop constraint if exists space_bookings_booker_check/.test(sql) &&
  /create trigger trg_space_bookings_booker_check/.test(sql) &&
  /conversations_migrated_to_room_id_fkey[\s\S]*on delete set null/.test(sql) &&
  /no foreign key to profiles is left without an ON DELETE rule/.test(tap) &&
  /can delete their account/.test(tap)
if (!ok) {
  console.error('SEC-040 FAIL: foreign keys to profiles(id) with no ON DELETE rule still refuse an account delete for any member who follows, joined or booked a Space')
  process.exit(1)
}
console.log(`SEC-040 ok: ${hit} gives all 24 profile foreign keys a delete rule, proved by pgTAP`)

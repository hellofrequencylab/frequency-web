// SCAN-696: the member write guard on event_rsvps (migration 20270345011900).
//
// The behaviour itself is proved by pgTAP (supabase/tests/event_rsvps_member_write_guard.test.sql),
// which runs against a real Postgres in CI. This vitest half pins the SHAPE that the pgTAP file and
// the app rely on, so a later edit cannot quietly weaken it:
//
//   * the trigger is BEFORE INSERT OR UPDATE, sorts before the capacity trigger, and the function
//     is SECURITY INVOKER (a definer body would read its owner as current_user and exempt every
//     write, which is the whole guard gone);
//   * every host-attested / door-written column is frozen on both branches;
//   * the plus_ones ceiling in SQL is the same number both app clamps use.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

import { MAX_GUEST_PLUS_ONES } from './guest-seat'
import { MAX_PLUS_ONES } from './rsvp-gate'

const MIGRATION = 'supabase/migrations/20270345011900_event_rsvps_member_write_guard.sql'
const PGTAP = 'supabase/tests/event_rsvps_member_write_guard.test.sql'
const TRIGGER = 'trg_a_event_rsvps_member_write_guard'
const FROZEN = [
  'attended_at',
  'attended_by',
  'guest_email',
  'guest_name',
  'guest_claimed_by',
  'guest_claimed_at',
  'seat_token_hash',
  'from_ticket_id',
]

describe('event_rsvps member write guard (SCAN-696)', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  const fn = sql.slice(sql.indexOf('create or replace function public.guard_event_rsvp_member_write'), sql.indexOf('$$;'))

  it('is a BEFORE INSERT OR UPDATE trigger whose name fires before the capacity trigger', () => {
    expect(sql).toMatch(new RegExp(`create trigger ${TRIGGER}\\s+before insert or update on public\\.event_rsvps`))
    expect(TRIGGER < 'trg_enforce_event_rsvp_capacity').toBe(true)
    expect(TRIGGER < 'trg_event_rsvps_block_suspended').toBe(true)
  })

  it('runs as the caller (SECURITY INVOKER), so a member write is seen as a member write', () => {
    expect(fn).toMatch(/\nsecurity invoker\n/)
    expect(fn).not.toMatch(/security definer/)
    expect(fn).toMatch(/current_user in \('service_role', 'postgres', 'supabase_admin'\)/)
  })

  it('freezes every host-attested and door-written column on insert and on update', () => {
    const insertBranch = fn.slice(fn.indexOf("tg_op = 'INSERT'"), fn.indexOf('-- UPDATE:'))
    const updateBranch = fn.slice(fn.indexOf('-- UPDATE:'))
    for (const col of FROZEN) {
      expect(insertBranch, `insert branch refuses ${col}`).toMatch(new RegExp(`new\\.${col}\\s+is not null`))
      expect(updateBranch, `update branch refuses a change to ${col}`).toMatch(
        new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`)
      )
    }
    expect(insertBranch).toMatch(/new\.approval_status not in \('none', 'pending'\)/)
    expect(updateBranch).toMatch(/new\.approval_status <> 'pending'/)
  })

  it('caps plus_ones at the same number both app clamps use', () => {
    const m = sql.match(/check \(plus_ones between 0 and (\d+)\)/)
    expect(m).not.toBeNull()
    const ceiling = Number(m![1])
    expect(ceiling).toBe(MAX_GUEST_PLUS_ONES)
    // SCAN-697 moved the member clamp out of the actions file into the shared gate, where every
    // write path (actions, the depth sheet, rsvp-depth) imports it; pin the export itself.
    expect(ceiling).toBe(MAX_PLUS_ONES)
    const actions = readFileSync('app/(main)/events/actions.ts', 'utf8')
    expect(actions).toMatch(/import \{[^}]*\bMAX_PLUS_ONES\b[^}]*\} from '@\/lib\/events\/rsvp-gate'/)
  })

  it('is the last migration to touch the plus_ones check, and the pgTAP file exercises the trigger as a member', () => {
    const touching = readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => /event_rsvps_plus_ones_check/.test(readFileSync(`supabase/migrations/${f}`, 'utf8')))
      .sort()
    expect(touching[touching.length - 1]).toBe(MIGRATION.split('/').pop())

    const tap = readFileSync(PGTAP, 'utf8')
    expect(tap).toContain(TRIGGER)
    expect(tap).toMatch(/set local role authenticated;[\s\S]*approval_status = 'approved'[\s\S]*'42501'/)
    expect(tap).toMatch(/set local role authenticated;[\s\S]*attended_at = now\(\)[\s\S]*'42501'/)
    expect(tap).toMatch(/plus_ones = 500[\s\S]*'23514'/)
  })
})

describe('event_rsvps member write guard (SCAN-844)', () => {
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const latest = [...files].reverse().find((f) => {
    const s = readFileSync(`supabase/migrations/${f}`, 'utf8')
    return f > '20270345011900' && /guard_event_rsvp_member_write/.test(s) && /rsvp_requires_approval/.test(s)
  })
  const sql = latest ? readFileSync(`supabase/migrations/${latest}`, 'utf8') : ''
  const start = sql.indexOf('create or replace function public.guard_event_rsvp_member_write')
  const fn = start >= 0 ? sql.slice(start, sql.indexOf('$$;', start)) : ''
  const insertBranch = fn.slice(fn.indexOf("tg_op = 'INSERT'"), fn.indexOf('-- UPDATE:'))

  it('ships a later migration that keeps the trigger INVOKER and reads the approval flag on insert', () => {
    expect(latest, 'SCAN-844: a member can insert an admitted RSVP on an approval-gated event').toBeTruthy()
    expect(fn).toMatch(/\nsecurity invoker\n/)
    expect(fn).not.toMatch(/security definer/)
    expect(insertBranch).toMatch(/private\.event_rsvp_requires_approval\(new\.event_id\)/)
    expect(insertBranch).toMatch(/new\.approval_status is distinct from 'pending'/)
  })

  it('reads the withheld column through a definer helper, so the INVOKER trigger does not fail open', () => {
    expect(sql).toMatch(
      /create or replace function private\.event_rsvp_requires_approval\(p_event_id uuid\)[\s\S]*security definer/
    )
    expect(sql).toMatch(/revoke all on function private\.event_rsvp_requires_approval\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function private\.event_rsvp_requires_approval\(uuid\) to authenticated/)
    expect(sql).toMatch(/coalesce\([\s\S]*rsvp_requires_approval[\s\S]*true/)
  })

  it('pgTAP refuses delete-then-insert none on a gated event, and still admits none on an open event', () => {
    const tap = readFileSync(PGTAP, 'utf8')
    expect(tap).toMatch(
      /delete from public\.event_rsvps[\s\S]*approval_status\)[\s\S]*'none'[\s\S]*'42501'[\s\S]*re-insert an admitted seat on an approval-gated event/
    )
    expect(tap).toMatch(/does not require approval/)
  })
})

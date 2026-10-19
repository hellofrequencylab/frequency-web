// SCAN-845: the founder once-only record cannot live in member-writable profile meta.
//
// The behaviour itself is proved by pgTAP (supabase/tests/prevent_founder_meta_self_edit.test.sql),
// which runs against a real Postgres in CI. This vitest half pins the SHAPE that the pgTAP file
// and claimFounderRewards rely on, so a later edit cannot quietly weaken it:
//
//   * a migration after the SCAN-759 compare-and-set refuses a change to meta.founder unless
//     the caller is service_role;
//   * the trigger is BEFORE UPDATE on profiles;
//   * the function is not an RPC (revoked from anon and authenticated);
//   * claimFounderRewards still stamps through claim_founder_flags (service role).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const MIGRATION = 'supabase/migrations/20270346009500_prevent_founder_meta_self_edit.sql'
const PGTAP = 'supabase/tests/prevent_founder_meta_self_edit.test.sql'
const ACTION = 'app/(main)/founder/founder-actions.ts'

describe('founder meta write guard (SCAN-845)', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  const fn = sql.slice(sql.indexOf('create or replace function public.prevent_founder_meta_self_edit'), sql.indexOf('$$;'))

  it('is the migration the SCAN-845 probe accepts: after 20270345013100, founder, BEFORE UPDATE on profiles', () => {
    const name = MIGRATION.split('/').pop() ?? ''
    expect(name > '20270345013100').toBe(true)
    expect(sql).toMatch(/founder/i)
    expect(sql).toMatch(/before update[\s\S]*profiles/i)
  })

  it('refuses a change to meta.founder unless the caller is service_role', () => {
    expect(fn).toMatch(/auth\.role\(\)\s+is distinct from 'service_role'/)
    expect(fn).toMatch(/\(new\.meta\s*->\s*'founder'\)\s+is distinct from\s+\(old\.meta\s*->\s*'founder'\)/)
    expect(fn).toMatch(/errcode = '42501'/)
  })

  it('is a BEFORE UPDATE trigger on profiles, and is not an RPC', () => {
    expect(sql).toMatch(/create trigger prevent_founder_meta_self_edit\s+before update on public\.profiles/)
    expect(fn).toMatch(/\nsecurity definer\n/)
    expect(sql).toMatch(/revoke (all|execute) on function public\.prevent_founder_meta_self_edit\(\) from public, anon, authenticated/)
  })

  it('is the last migration to mention prevent_founder_meta_self_edit, and pgTAP exercises the member wipe', () => {
    const touching = readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => /prevent_founder_meta_self_edit/.test(readFileSync(`supabase/migrations/${f}`, 'utf8')))
      .sort()
    expect(touching[touching.length - 1]).toBe(MIGRATION.split('/').pop())

    const tap = readFileSync(PGTAP, 'utf8')
    expect(tap).toMatch(/merge_profile_meta/)
    expect(tap).toMatch(/remove_profile_meta_keys/)
    expect(tap).toMatch(/claim_founder_flags/)
    expect(tap).toMatch(/role', 'authenticated'/)
  })

  it('claimFounderRewards still stamps through the service-role RPC, not a member meta write', () => {
    const src = readFileSync(ACTION, 'utf8')
    expect(src).toMatch(/rpc\('claim_founder_flags'/)
    expect(src).not.toMatch(/merge_profile_meta/)
  })
})

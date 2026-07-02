import { describe, it, expect } from 'vitest'
import { scanRls } from './check-rls.mjs'

// Self-test for the RLS guard's pure scanner (Phase 1, docs/MAINTENANCE-AUTOMATION.md). Proves it
// actually catches the failure modes — otherwise a regex bug could make check:rls pass vacuously
// and a table shipped with RLS off would sail through CI unnoticed.

describe('scanRls', () => {
  it('flags a table created with RLS never enabled (the real exposure)', () => {
    const sql = `
      create table if not exists exposed (id uuid primary key);
      create table if not exists safe (id uuid primary key);
      alter table safe enable row level security;
      create policy safe_read on safe for select using (true);
    `
    const { missingRls } = scanRls(sql)
    expect(missingRls).toContain('exposed')
    expect(missingRls).not.toContain('safe')
  })

  it('flags an RLS-on table with no policy that is not on the deny-all allowlist', () => {
    const sql = `
      create table if not exists forgot (id uuid);
      alter table forgot enable row level security;
    `
    expect(scanRls(sql, new Set()).noPolicy).toContain('forgot')
    // ...unless it is a reviewed service-role-only table:
    expect(scanRls(sql, new Set(['forgot'])).noPolicy).not.toContain('forgot')
  })

  it('accepts a table with RLS + a policy, and ignores schema-qualified refs + drops', () => {
    const sql = `
      create table if not exists public.done (id uuid);
      alter table public.done enable row level security;
      create policy done_read on public.done for select using (true);
      create table if not exists gone (id uuid);
      drop table if exists gone;
    `
    const { missingRls, noPolicy } = scanRls(sql)
    expect(missingRls).toEqual([]) // done is protected; gone was dropped so it's not "live"
    expect(noPolicy).toEqual([])
  })

  it('does not scan `create table` inside a -- line comment', () => {
    const sql = `-- create table if the flag is set, we would add one here\nselect 1;`
    expect(scanRls(sql).missingRls).toEqual([])
  })

  it('skips non-public schemas (extensions / storage / auth)', () => {
    const sql = `create table if not exists storage.objects (id uuid); create table extensions.foo (id uuid);`
    const { missingRls, noPolicy } = scanRls(sql)
    expect(missingRls).toEqual([])
    expect(noPolicy).toEqual([])
  })
})

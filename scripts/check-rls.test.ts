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

// ── Allowlist rot ────────────────────────────────────────────────────────────
// The deny-all list is only ever SUBTRACTED from the live set, so a line naming a table that no
// longer exists exempts nothing and warns nobody. It is invisible by construction: the guard stays
// green, and the file slowly stops describing the database it is supposed to account for. Every
// other frozen list in this repo guards its own rot in so many words; this one did not, and it had
// drifted by one (`program_adoptions`, dropped by migration 20261114000000).

describe('deny-all allowlist rot', () => {
  it('reports an allowlist entry whose table was dropped', () => {
    const sql = `
      create table gone (id uuid primary key);
      alter table gone enable row level security;
      drop table if exists public.gone;
      create table here (id uuid primary key);
      alter table here enable row level security;
    `
    const { staleDenyAll, noPolicy } = scanRls(sql, new Set(['gone', 'here']))
    expect(staleDenyAll).toEqual(['gone'])
    // `here` is genuinely exempted, so it must NOT be reported as debt in either direction.
    expect(noPolicy).not.toContain('here')
    expect(staleDenyAll).not.toContain('here')
  })

  it('reports an allowlist entry for a table that was never created at all (a typo)', () => {
    const sql = `
      create table real_table (id uuid primary key);
      alter table real_table enable row level security;
    `
    const { staleDenyAll } = scanRls(sql, new Set(['real_table', 'raelt_able']))
    expect(staleDenyAll).toEqual(['raelt_able'])
  })

  it('is silent when every allowlist entry is a live table', () => {
    const sql = `
      create table a (id uuid primary key);
      alter table a enable row level security;
    `
    expect(scanRls(sql, new Set(['a'])).staleDenyAll).toEqual([])
  })
})

describe('the floors (a gate that scans nothing must not pass everything)', () => {
  it('exports both floors, and they sit below the real corpus but far above zero', async () => {
    const { MIN_MIGRATIONS, MIN_LIVE_TABLES } = await import('./check-rls.mjs')
    const { readdirSync } = await import('node:fs')
    const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))
    // A floor above the live corpus fails the build on a true reading; one at zero buys nothing.
    expect(MIN_MIGRATIONS).toBeGreaterThan(0)
    expect(MIN_MIGRATIONS).toBeLessThanOrEqual(files.length)
    expect(MIN_LIVE_TABLES).toBeGreaterThan(0)
  })
})

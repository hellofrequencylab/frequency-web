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

  it('does not scan DDL inside a /* block comment */ (the ROLLBACK-script shape)', () => {
    // Migrations here park their rollback script in a block comment. Reading it as real DDL made
    // 20260628010000 look like it dropped journey_completions, so that table vanished from the
    // live set and stopped being checked at all — while existing, RLS-on, in production.
    const { missingRls, noPolicy, lastPolicyDropped, liveCount } = scanRls(`
      create table kept (id uuid primary key);
      alter table kept enable row level security;
      create policy kept_read on kept for select using (true);
      /* ROLLBACK:
           drop table if exists public.kept;
           drop policy kept_read on kept;
      */
      select 1;
    `)
    expect(liveCount).toBe(1) // the commented-out drop did not retire it
    expect(missingRls).toEqual([])
    expect(noPolicy).toEqual([])
    expect(lastPolicyDropped).toEqual([]) // nor did the commented-out drop policy
  })

  it('strips each block comment separately, keeping the real DDL between two of them', () => {
    // The greedy-strip hazard, in its cheapest form: `/\*[\s\S]*\*/` runs from the FIRST `/*` to
    // the LAST `*/` and eats every statement in between. A migration that brackets its work with a
    // banner comment and a rollback comment would lose the whole table it creates.
    const { missingRls, liveCount } = scanRls(`
      /* ── banner ─────────────────── */
      create table between_them (id uuid primary key);
      /* ROLLBACK: drop table between_them; */
    `)
    expect(liveCount).toBe(1)
    expect(missingRls).toEqual(['between_them']) // seen, and correctly flagged as RLS-less
  })

  it('does not let an unmatched `/*` in one file swallow DDL in the next', () => {
    // Ten migrations carry a lone `/*` or `*/` inside a string literal or a regex. Stripping must
    // be lazy AND per file, or one file's stray delimiter eats the next file's real statements.
    const { missingRls, liveCount } = scanRls([
      `insert into cfg (pattern) values ('/* not a comment, just text');`,
      `create table later (id uuid primary key);`,
      `select 1; */`,
    ])
    expect(liveCount).toBe(1)
    expect(missingRls).toEqual(['later']) // still seen, and still scored
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

// ── Order-aware policy replay ────────────────────────────────────────────────
// The scan used to collect `create policy` into a set and never read `drop policy` at all, so a
// table that lost its LAST policy scored as policied forever — exactly the regression this gate
// exists to catch. It also did set subtraction over the whole history for tables, so a
// `drop table t; create table t;` pair read as "dropped" and quietly removed a live table from the
// checked set. Both are order problems, and a boolean per table cannot fix either: policies have
// names, and `drop policy "x"; create policy "x";` is the ordinary way to edit one in place.

describe('scanRls policy replay (order- and name-aware)', () => {
  const withRls = (body: string) => `
    create table if not exists t (id uuid primary key);
    alter table t enable row level security;
    ${body}
  `

  it('ends at ZERO when the only policy is created and later dropped', () => {
    const { lastPolicyDropped, noPolicy } = scanRls(
      withRls(`
        create policy t_read on t for select using (true);
        drop policy t_read on t;
      `),
    )
    expect(lastPolicyDropped).toEqual(['t'])
    // It HAD a policy, so it is the "last policy dropped" finding, not the never-policied one.
    expect(noPolicy).toEqual([])
  })

  it('ends at ONE when a policy is dropped and re-created in the same file (an in-place edit)', () => {
    // The commerce_variants shape: every migration that edits a policy drops it first. Scoring
    // this as zero would fail the build on the single most common policy-maintenance pattern.
    const { lastPolicyDropped, noPolicy } = scanRls(
      withRls(`
        create policy t_read on t for select using (true);
        drop policy if exists t_read on t;
        create policy t_read on t for select using (auth.uid() is not null);
      `),
    )
    expect(lastPolicyDropped).toEqual([])
    expect(noPolicy).toEqual([])
  })

  it('does not underflow when `drop policy if exists` names a policy that was never created', () => {
    // A drop of an absent name must remove nothing — not the table's one real policy, and not a
    // phantom that pushes the count below zero.
    const { lastPolicyDropped, noPolicy, liveCount } = scanRls(
      withRls(`
        drop policy if exists t_never_existed on t;
        create policy t_read on t for select using (true);
        drop policy if exists t_also_never_existed on t;
      `),
    )
    expect(lastPolicyDropped).toEqual([])
    expect(noPolicy).toEqual([])
    expect(liveCount).toBe(1)
  })

  it('does not underflow when every policy op is a drop and none was ever created', () => {
    const { lastPolicyDropped, noPolicy } = scanRls(
      withRls(`
        drop policy if exists a on t;
        drop policy if exists b on t;
      `),
    )
    // Never had one, so it is the original never-policied finding — and it appears exactly once.
    expect(noPolicy).toEqual(['t'])
    expect(lastPolicyDropped).toEqual([])
  })

  it('drops the TABLE out of consideration entirely rather than reporting it at zero policies', () => {
    // `groups` / `group_memberships`: policies created in 20240101000001, dropped in 20240102000000,
    // and the table DROPped in the same migration. A table that no longer exists cannot be a finding.
    const sql = `
      create table gone (id uuid primary key);
      alter table gone enable row level security;
      create policy gone_read on gone for select using (true);
      drop policy gone_read on gone;
      drop table gone;
      create table stays (id uuid primary key);
      alter table stays enable row level security;
      create policy stays_read on stays for select using (true);
    `
    const { lastPolicyDropped, noPolicy, missingRls, liveCount } = scanRls(sql)
    expect(lastPolicyDropped).toEqual([])
    expect(noPolicy).toEqual([])
    expect(missingRls).toEqual([])
    expect(liveCount).toBe(1) // only `stays`
  })

  it('re-checks a table that was dropped and later RE-created', () => {
    // `commerce_variants`: created 20260815000000, dropped 20260928000000, re-created 20261132000000.
    // Order-blind set subtraction called it "dropped" forever, so it went unchecked for RLS the
    // entire time it was live. The re-created table must be scored on its NEW definition.
    const reCreatedBare = `
      create table v (id uuid primary key);
      alter table v enable row level security;
      create policy v_read on v for select using (true);
      drop table if exists v cascade;
      create table if not exists v (id uuid primary key);
    `
    // Re-created without RLS: a real exposure, and the old scan could not see it.
    expect(scanRls(reCreatedBare).missingRls).toEqual(['v'])
    // Re-created with RLS and a fresh policy: clean.
    const clean = scanRls(`${reCreatedBare}
      alter table v enable row level security;
      create policy v_read on v for select using (true);
    `)
    expect(clean.missingRls).toEqual([])
    expect(clean.noPolicy).toEqual([])
    expect(clean.lastPolicyDropped).toEqual([])
    expect(clean.liveCount).toBe(1)
  })

  it('does not carry policies across a drop/re-create of the same table', () => {
    // The re-created table starts clean: the old policies died with the old table.
    const { lastPolicyDropped, noPolicy } = scanRls(`
      create table v (id uuid primary key);
      alter table v enable row level security;
      create policy v_read on v for select using (true);
      drop table v;
      create table v (id uuid primary key);
      alter table v enable row level security;
    `)
    expect(noPolicy).toEqual(['v']) // never policied in ITS lifetime
    expect(lastPolicyDropped).toEqual([])
  })

  it('does not let `create table if not exists` re-run wipe an existing table’s policies', () => {
    const { lastPolicyDropped, noPolicy } = scanRls(`
      create table t (id uuid primary key);
      alter table t enable row level security;
      create policy t_read on t for select using (true);
      create table if not exists t (id uuid primary key);
    `)
    expect(lastPolicyDropped).toEqual([])
    expect(noPolicy).toEqual([])
  })

  it('treats `alter policy` as a no-op on how many policies a table has', () => {
    // ALTER POLICY retargets or renames an existing policy; it never adds or removes one.
    const { lastPolicyDropped, noPolicy } = scanRls(
      withRls(`
        create policy t_read on t for select using (true);
        alter policy t_read on t using ((select auth.uid()) is not null);
      `),
    )
    expect(lastPolicyDropped).toEqual([])
    expect(noPolicy).toEqual([])
  })

  it('carries RLS and policies across `alter table … rename to`', () => {
    // `domains` → `pillars` (20260613000010). A rename moves the table, its RLS state and every
    // policy on it to the new name. Scoring the OLD name keeps a ghost table in the live set and
    // loses every policy written under the new one.
    const { missingRls, noPolicy, lastPolicyDropped, liveCount } = scanRls(`
      create table domains (id uuid primary key);
      alter table domains enable row level security;
      create policy d_read on domains for select using (true);
      alter table public.domains rename to pillars;
      create policy p_write on pillars for insert with check (true);
    `)
    expect(liveCount).toBe(1) // `domains` is gone, not a second live table
    expect(missingRls).toEqual([]) // RLS travelled with it
    expect(noPolicy).toEqual([])
    expect(lastPolicyDropped).toEqual([])
  })

  it('reports a renamed table that then loses its last policy, under its NEW name', () => {
    const { lastPolicyDropped } = scanRls(`
      create table old_name (id uuid primary key);
      alter table old_name enable row level security;
      create policy p on old_name for select using (true);
      alter table old_name rename to new_name;
      drop policy p on new_name;
    `)
    expect(lastPolicyDropped).toEqual(['new_name'])
  })

  it('follows a table through a rename chain and out via a drop of its final name', () => {
    // `circle_field_transactions` → `circle_current_transactions`, dropped later under the new
    // name. The drop must retire the table the rename produced, leaving nothing live.
    expect(scanRls(`
      create table a (id uuid primary key);
      alter table a enable row level security;
      create policy p on a for select using (true);
      alter table a rename to b;
      drop table if exists public.b cascade;
    `).liveCount).toBe(0)
  })

  it('replays an array of files in the order given, across file boundaries', () => {
    // The CLI passes one chunk per migration, in filename order. A policy created in an early
    // migration and dropped in a later one must still resolve to zero.
    const { lastPolicyDropped } = scanRls([
      `create table t (id uuid primary key);
       alter table t enable row level security;
       create policy t_read on t for select using (true);`,
      `drop policy if exists t_read on t;`,
    ])
    expect(lastPolicyDropped).toEqual(['t'])
  })
})

describe('policy + table name spelling (quoted vs bare, schema-qualified vs not)', () => {
  const head = `
    create table t (id uuid primary key);
    alter table t enable row level security;
  `

  it('matches a quoted policy name dropped with the same quoted name', () => {
    // The real case: `drop policy if exists "Anyone can read active invite links" on
    // public.invite_links;` — a quoted name with spaces, which a bare-word regex misses entirely.
    const { lastPolicyDropped } = scanRls(`${head}
      create policy "Anyone can read active invite links" on t for select using (true);
      drop policy if exists "Anyone can read active invite links" on public.t;
    `)
    expect(lastPolicyDropped).toEqual(['t'])
  })

  it('treats a quoted and an unquoted spelling of the same name as the same policy', () => {
    // In Postgres `"t_read"` and `t_read` are one identifier, so a drop of either kills the policy.
    expect(scanRls(`${head}
      create policy "t_read" on t for select using (true);
      drop policy t_read on t;
    `).lastPolicyDropped).toEqual(['t'])

    expect(scanRls(`${head}
      create policy t_read on t for select using (true);
      drop policy "t_read" on t;
    `).lastPolicyDropped).toEqual(['t'])
  })

  it('does not confuse two DIFFERENT policy names on the same table', () => {
    // Dropping one of two policies must leave the table policied — a boolean could not tell.
    const { lastPolicyDropped, noPolicy } = scanRls(`${head}
      create policy t_read on t for select using (true);
      create policy t_write on t for insert with check (true);
      drop policy t_read on t;
    `)
    expect(lastPolicyDropped).toEqual([])
    expect(noPolicy).toEqual([])
  })

  it('matches `on public.foo` against a policy created `on foo`, and vice versa', () => {
    expect(scanRls(`
      create table if not exists public.t (id uuid primary key);
      alter table public.t enable row level security;
      create policy p on t for select using (true);
      drop policy p on public.t;
    `).lastPolicyDropped).toEqual(['t'])

    expect(scanRls(`${head}
      create policy p on public.t for select using (true);
      drop policy p on t;
    `).lastPolicyDropped).toEqual(['t'])
  })

  it('ignores policy churn on non-public schemas even when the bare name collides', () => {
    // `storage.objects` and a hypothetical `public.objects` share a bare name. A drop on the
    // storage table must not be scored against the public one.
    const { lastPolicyDropped, noPolicy } = scanRls(`
      create table public.objects (id uuid primary key);
      alter table public.objects enable row level security;
      create policy o_read on public.objects for select using (true);
      drop policy if exists o_read on storage.objects;
    `)
    expect(lastPolicyDropped).toEqual([])
    expect(noPolicy).toEqual([])
  })
})

describe('the deny-all allowlist covers zero-policy tables (that IS deny-all)', () => {
  // RLS-on-no-policy is the documented fail-closed posture for service-role-only tables, so a
  // listed table ending at zero policies is the intended state, not a finding — in EITHER
  // direction. `invite_links` is the live example: its one policy was dropped by
  // 20270210000000 because the invite token was world-readable, and the same commit listed it.
  const sql = `
    create table invite_links (id uuid primary key);
    alter table invite_links enable row level security;
    create policy "Anyone can read active invite links" on public.invite_links for select using (true);
    drop policy if exists "Anyone can read active invite links" on public.invite_links;
  `

  it('is a finding when the table is NOT listed', () => {
    expect(scanRls(sql).lastPolicyDropped).toEqual(['invite_links'])
  })

  it('is silent when the table IS listed, and does not become stale-allowlist debt instead', () => {
    const { lastPolicyDropped, noPolicy, staleDenyAll } = scanRls(sql, new Set(['invite_links']))
    expect(lastPolicyDropped).toEqual([])
    expect(noPolicy).toEqual([])
    // The table is live, so the allowlist entry is doing real work and must not be called stale.
    expect(staleDenyAll).toEqual([])
  })

  it('exempts a never-policied listed table too (the original deny-all case still works)', () => {
    const neverPolicied = `
      create table svc (id uuid primary key);
      alter table svc enable row level security;
    `
    expect(scanRls(neverPolicied, new Set(['svc'])).noPolicy).toEqual([])
    expect(scanRls(neverPolicied, new Set(['svc'])).lastPolicyDropped).toEqual([])
  })

  it('reports each zero-policy table in exactly one bucket, never both', () => {
    const { noPolicy, lastPolicyDropped } = scanRls(`
      create table had_one (id uuid primary key);
      alter table had_one enable row level security;
      create policy p on had_one for select using (true);
      drop policy p on had_one;
      create table never_had (id uuid primary key);
      alter table never_had enable row level security;
    `)
    expect(lastPolicyDropped).toEqual(['had_one'])
    expect(noPolicy).toEqual(['never_had'])
    expect(noPolicy.filter((t) => lastPolicyDropped.includes(t))).toEqual([])
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

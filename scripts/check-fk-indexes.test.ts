// Non-triviality tests for the unindexed-foreign-key gate (HYG-128).
//
// WHY THESE EXIST. The gate is a parser over SQL text, and a parser that misses a form passes
// silently, which is this repo's named failure (ADR-1011). Its first draft missed `on t(col)` with
// no space, and DDL inside `do $$ ... $$` blocks, and reported 28 unindexed keys where production's
// catalog held 9. So these drive every arm against fixtures that must FAIL and fixtures that must
// PASS, and then hold the real tree to the two controls measured against pg_constraint and pg_index
// on 2026-09-28: HYG-127's nine before 20270345009000, zero after.

import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  DIR,
  EXCEPTIONS,
  MIN_FKS,
  MIN_TABLES,
  apply,
  census,
  createState,
  leadingColumn,
  main,
  replay,
  statements,
  unindexed,
} from './check-fk-indexes.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const GUARD = path.join(ROOT, 'scripts/check-fk-indexes.mjs')

/** Replay a list of SQL snippets, in order, and return the unindexed set. */
function run(...sql: string[]): string[] {
  const state = createState()
  for (const s of sql) for (const stmt of statements(s)) apply(state, stmt)
  return unindexed(state)
}

const PARENT = 'create table public.profiles (id uuid primary key);'
const CHILD = 'create table public.things (id uuid primary key, owner_id uuid references public.profiles(id) on delete set null);'

describe('scrub and split', () => {
  it('drops comments, string literals and dollar-quoted bodies from the top level', () => {
    const s = statements("-- references nothing\ncreate table a (id uuid primary key); /* references b */ select 'references c';")
    expect(s).toEqual(['create table a (id uuid primary key)', "select ''"])
  })

  it('replays literal DDL inside a do block and skips dynamic execute', () => {
    const s = statements(
      "do $$ begin if not exists (select 1) then alter table public.pages add primary key (space_id, route); end if; execute format('alter table %I drop constraint x', 'pages'); end $$;",
    )
    expect(s).toContain('alter table public.pages add primary key (space_id, route)')
    expect(s.some((x) => x.startsWith('execute'))).toBe(false)
  })

  it('reads the leading column of a key list and refuses an expression', () => {
    expect(leadingColumn('space_id, route')).toBe('space_id')
    expect(leadingColumn('created_at desc nulls last')).toBe('created_at')
    expect(leadingColumn('"quoted_col"')).toBe('quoted_col')
    expect(leadingColumn('lower(email)')).toBeNull()
  })
})

describe('the replay, arm by arm', () => {
  it('FAILS a foreign key with no index', () => {
    expect(run(PARENT, CHILD)).toEqual(['things.owner_id'])
  })

  it('passes once an index leads with the column, in every spelling this repo uses', () => {
    expect(run(PARENT, CHILD, 'create index if not exists things_owner_idx on public.things (owner_id);')).toEqual([])
    expect(run(PARENT, CHILD, 'CREATE INDEX idx ON things(owner_id);')).toEqual([])
    expect(run(PARENT, CHILD, 'create index idx on things using btree (owner_id) where owner_id is not null;')).toEqual([])
    expect(run(PARENT, CHILD, 'create unique index idx on public.things (owner_id, id);')).toEqual([])
  })

  it('FAILS when the only index has the column SECOND, as Postgres does', () => {
    expect(run(PARENT, CHILD, 'create index idx on public.things (id, owner_id);')).toEqual(['things.owner_id'])
  })

  it('counts a primary key or unique constraint that leads with the column', () => {
    expect(run(PARENT, 'create table t (owner_id uuid references profiles(id), route text, primary key (owner_id, route));')).toEqual([])
    expect(run(PARENT, 'create table t (id uuid primary key, owner_id uuid references profiles(id) unique);')).toEqual([])
    expect(run(PARENT, 'create table t (id uuid primary key, owner_id uuid references profiles(id));', 'alter table t add constraint t_key unique nulls not distinct (owner_id, id);')).toEqual([])
    expect(run(PARENT, 'create table t (id uuid primary key, owner_id uuid references profiles(id), n int, unique (n, owner_id));')).toEqual(['t.owner_id'])
  })

  it('reads table-level foreign keys, added columns and added constraints', () => {
    expect(run(PARENT, 'create table t (id uuid primary key, owner_id uuid, foreign key (owner_id) references profiles(id));')).toEqual(['t.owner_id'])
    expect(run(PARENT, 'create table t (id uuid primary key);', 'alter table public.t add column if not exists owner_id uuid references public.profiles(id);')).toEqual(['t.owner_id'])
    expect(run(PARENT, 'create table t (id uuid primary key, owner_id uuid);', 'alter table t add constraint t_owner_fkey foreign key (owner_id) references profiles(id);')).toEqual(['t.owner_id'])
  })

  it('FAILS again when the covering index is dropped', () => {
    expect(run(PARENT, CHILD, 'create index things_owner_idx on things (owner_id);', 'drop index if exists things_owner_idx;')).toEqual(['things.owner_id'])
    expect(run(PARENT, CHILD, 'create index things_owner_idx on things (owner_id);', 'drop index public.things_owner_idx;')).toEqual(['things.owner_id'])
  })

  it('forgets a key whose column, constraint or table is gone', () => {
    expect(run(PARENT, CHILD, 'alter table things drop column owner_id;')).toEqual([])
    expect(run(PARENT, CHILD, 'alter table things drop constraint things_owner_id_fkey;')).toEqual([])
    expect(run(PARENT, 'create table t (id uuid primary key, owner_id uuid constraint owner_fk references profiles(id));', 'alter table t drop constraint if exists owner_fk;')).toEqual([])
    expect(run(PARENT, CHILD, 'drop table if exists public.things cascade;')).toEqual([])
  })

  it('follows a renamed column and a renamed table', () => {
    expect(run(PARENT, CHILD, 'create index idx on things (owner_id);', 'alter table things rename column owner_id to author_id;')).toEqual([])
    expect(run(PARENT, CHILD, 'alter table things rename column owner_id to author_id;')).toEqual(['things.author_id'])
    expect(run(PARENT, CHILD, 'alter table things rename to objects;')).toEqual(['objects.owner_id'])
  })

  it('ignores other schemas and treats unqualified names as public', () => {
    expect(run(PARENT, 'create table private.t (id uuid primary key, owner_id uuid references public.profiles(id));')).toEqual([])
    expect(run('create table profiles (id uuid primary key);', 'create table t (id uuid primary key, owner_id uuid references profiles(id));', 'create index i on public.t (owner_id);')).toEqual([])
  })

  it('does not read a references clause out of a function body or a comment', () => {
    expect(run(PARENT, "create function f() returns void language plpgsql as $$ begin create table x (owner_id uuid references profiles(id)); end $$;")).toEqual([])
    expect(run(PARENT, '-- create table y (owner_id uuid references profiles(id));')).toEqual([])
  })

  it('reads a primary key added inside a do block, the page_settings shape', () => {
    expect(
      run(
        PARENT,
        'create table page_settings (space_id uuid references profiles(id), route text);',
        "do $$ begin if not exists (select 1 from pg_constraint) then alter table public.page_settings add primary key (space_id, route); end if; end $$;",
      ),
    ).toEqual([])
  })
})

// ── THE REAL TREE, held to the catalog ──────────────────────────────────────────────────────────

const temps: string[] = []
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
})

/** A directory of symlinks to the real migrations, minus `without`, plus `extra` files. */
function tree(opts: { without?: RegExp; extra?: Record<string, string> } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fk-indexes-'))
  temps.push(dir)
  for (const f of readdirSync(path.join(ROOT, DIR))) {
    if (!f.endsWith('.sql') || (opts.without && opts.without.test(f))) continue
    symlinkSync(path.join(ROOT, DIR, f), path.join(dir, f))
  }
  for (const [name, sql] of Object.entries(opts.extra ?? {})) writeFileSync(path.join(dir, name), sql)
  return dir
}

function cli(args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync(process.execPath, [GUARD, ...args], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }) }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

const NINE = [
  'space_calendar_entries.removed_by',
  'space_calendar_private_feeds.created_by',
  'space_plan_playbooks.created_by',
  'space_plan_shares.guest_space_id',
  'space_plan_shares.requested_by',
  'space_plan_shares.responded_by',
  'space_plans.created_by',
  'space_plans.owner_profile_id',
  'space_plans.playbook_id',
]

describe('the real tree', () => {
  it('reads a corpus above the floors, so an empty read cannot pass', () => {
    const { state } = replay()
    const c = census(state)
    expect(c.tables).toBeGreaterThanOrEqual(MIN_TABLES)
    expect(c.fks).toBeGreaterThanOrEqual(MIN_FKS)
  })

  it('CONTROL: without 20270345009000 the tree reads exactly HYG-127\'s nine, which is what pg_constraint said on 2026-09-28', () => {
    const { state } = replay(tree({ without: /^20270345009000_/ }))
    expect(unindexed(state)).toEqual(NINE)
  })

  it('passes on the tree as committed, so the gate is green the day it lands', () => {
    expect(unindexed(replay().state)).toEqual([])
    const r = cli([])
    expect(r.code, r.out).toBe(0)
  })

  it('MUTATION: a migration that adds a foreign key with no index fails the CLI, and passes with the index', () => {
    const bad = tree({ extra: { '20990101000000_mutant.sql': 'create table public.mutant (id uuid primary key, owner_id uuid references public.profiles(id));' } })
    const r = cli(['--dir', bad])
    expect(r.code).toBe(1)
    expect(r.out).toContain('mutant.owner_id')
    const good = tree({
      extra: {
        '20990101000000_mutant.sql':
          'create table public.mutant (id uuid primary key, owner_id uuid references public.profiles(id));\ncreate index if not exists mutant_owner_id_idx on public.mutant (owner_id) where owner_id is not null;',
      },
    })
    const ok = cli(['--dir', good])
    expect(ok.code, ok.out).toBe(0)
  })

  it('refuses an empty or unreadable directory rather than printing a tick over nothing', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'fk-indexes-empty-'))
    temps.push(empty)
    const r = cli(['--dir', empty])
    expect(r.code).toBe(1)
    expect(r.out).toContain(`under the floors of ${MIN_TABLES} and ${MIN_FKS}`)
    expect(cli(['--dir', path.join(empty, 'nope')]).code).toBe(1)
  })

  it('EXCEPTIONS is empty today, and a stale entry would fail', () => {
    expect(Object.keys(EXCEPTIONS)).toEqual([])
    // main() is importable: drive it with a directory whose one unindexed key is not excepted.
    const bad = tree({ extra: { '20990101000000_mutant.sql': 'create table public.mutant (id uuid primary key, owner_id uuid references public.profiles(id));' } })
    expect(main(['--dir', bad])).toBe(1)
  })
})

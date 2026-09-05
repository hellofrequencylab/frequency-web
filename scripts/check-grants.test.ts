import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MIN_LIVE_TABLES, liveTables, parseLedger, revokedTables } from './check-grants.mjs'

// The table-grant contract (ADR-959 / ADR-964), proven to FAIL as well as to pass (scan2 L8-02).
//
// Until 2026-09-05 nothing imported or spawned scripts/check-grants.mjs; the only mentions in the
// suite were comments. So a parser change that made `liveTables()` match nothing would have passed
// CI green with "0 live public table(s), every one with a verdict". This file spawns the guard
// against fixture trees (the exit code is what the workflow reads), one planted violation per arm
// and one clean case, and asserts the floor fires on an empty parse.
//
// The guard reads `supabase/migrations` and `scripts/table-grants.txt` relative to cwd, so each
// fixture is a whole tiny repo root and the guard is spawned FROM it.

const ROOT = process.cwd()
const GUARD = path.join(ROOT, 'scripts/check-grants.mjs')

/** The guard's MIN_MIGRATIONS floor is 400; ballast files are empty comments so they can never
 *  satisfy an assertion by accident. */
const BALLAST = 405
/** Enough tables to clear MIN_LIVE_TABLES with room, so the clean case is a real pass. */
const TABLES = MIN_LIVE_TABLES + 10

type Fixture = { dir: string; add: (name: string, sql: string) => void; ledger: (text: string) => void }

const fixtures: string[] = []
afterAll(() => {
  for (const d of fixtures) rmSync(d, { recursive: true, force: true })
})

function makeFixture({ ballast = BALLAST, tables = TABLES }: { ballast?: number; tables?: number } = {}): Fixture {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-grants-'))
  fixtures.push(dir)
  mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true })
  mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  for (let i = 0; i < ballast; i++) {
    writeFileSync(path.join(dir, `supabase/migrations/${String(20200000000000 + i)}_ballast.sql`), '-- ballast\n')
  }
  const names = Array.from({ length: tables }, (_, i) => `t_${String(i).padStart(3, '0')}`)
  if (tables > 0) {
    writeFileSync(
      path.join(dir, 'supabase/migrations/20260101000000_tables.sql'),
      names.map((n) => `create table if not exists public.${n} (id uuid primary key);`).join('\n') + '\n',
    )
  }
  writeFileSync(path.join(dir, 'scripts/table-grants.txt'), names.map((n) => `${n}  authenticated`).join('\n') + '\n')
  return {
    dir,
    add: (name, sql) => writeFileSync(path.join(dir, 'supabase/migrations', name), sql),
    ledger: (text) => writeFileSync(path.join(dir, 'scripts/table-grants.txt'), text),
  }
}

function run(dir: string) {
  const res = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' })
  return { code: res.status ?? -1, out: `${res.stdout}\n${res.stderr}` }
}

describe('check-grants · the clean case is a real pass', () => {
  it('exits 0 and counts every table it parsed', () => {
    const f = makeFixture()
    const { code, out } = run(f.dir)
    expect(code).toBe(0)
    expect(out).toContain(`${TABLES} live public table(s), every one with a verdict`)
  })
})

describe('check-grants · one planted violation per arm', () => {
  it('a new table with no verdict fails and is named', () => {
    const f = makeFixture()
    f.add('20260102000000_probe.sql', 'create table public.l8_phantom_probe (id uuid primary key);\n')
    const { code, out } = run(f.dir)
    expect(code).toBe(1)
    expect(out).toContain('no grant verdict for `l8_phantom_probe`')
    expect(out).toContain('created in supabase/migrations/20260102000000_probe.sql')
  })

  it('a ledger row for a table that does not exist fails as stale', () => {
    const f = makeFixture()
    f.ledger(`t_000  authenticated\nghost_table  internal\n` + Array.from({ length: TABLES - 1 }, (_, i) => `t_${String(i + 1).padStart(3, '0')}  authenticated`).join('\n'))
    const { code, out } = run(f.dir)
    expect(code).toBe(1)
    expect(out).toContain('stale ledger entry `ghost_table`')
  })

  it('an `internal` verdict with no revoke fails, and a revoke from anon satisfies it', () => {
    const f = makeFixture()
    const rows = Array.from({ length: TABLES }, (_, i) => `t_${String(i).padStart(3, '0')}  ${i === 0 ? 'internal' : 'authenticated'}`)
    f.ledger(rows.join('\n') + '\n')
    const before = run(f.dir)
    expect(before.code).toBe(1)
    expect(before.out).toContain('`t_000` is marked `internal` but never revoked')

    f.add('20260103000000_revoke.sql', 'revoke all on table public.t_000 from anon, authenticated;\n')
    const after = run(f.dir)
    expect(after.code).toBe(0)
  })

  it('a dropped table takes its verdict with it, and a drop inside a block comment does not count', () => {
    const files = [
      { text: 'create table public.a (id uuid);\ncreate table public.b (id uuid);\n' },
      { text: '/* rollback:\n  drop table if exists public.a;\n*/\ndrop table if exists public.b;\n' },
    ]
    expect([...liveTables(files)].sort()).toEqual(['a'])
  })

  it('revoking from public alone does not satisfy `internal`; the revoke must name anon', () => {
    expect(revokedTables([{ text: 'revoke all on table public.x from public;' }]).has('x')).toBe(false)
    expect(revokedTables([{ text: 'revoke all on table public.x from anon, authenticated;' }]).has('x')).toBe(true)
  })

  it('an unparseable ledger line is reported, not skipped', () => {
    const { entries, bad } = parseLedger('good  public\nbad_verdict  sometimes\n')
    expect(entries.has('good')).toBe(true)
    expect(bad).toHaveLength(1)
  })
})

describe('check-grants · the non-triviality floors', () => {
  it('an empty parse over a full migrations directory is "saw nothing" (exit 2), not a pass', () => {
    // 405 migrations read, zero tables parsed, zero ledger rows: before the floor this was the
    // bijection holding over two empty sets, printed as a clean verdict.
    const f = makeFixture({ tables: 0 })
    f.ledger('')
    const { code, out } = run(f.dir)
    expect(code).toBe(2)
    expect(out).toContain(`parsed only 0 live public table(s)`)
    expect(out).toContain(`expected at least ${MIN_LIVE_TABLES}`)
  })

  it('too few migrations is exit 2 as well, distinct from a violation', () => {
    const f = makeFixture({ ballast: 10 })
    const { code, out } = run(f.dir)
    expect(code).toBe(2)
    expect(out).toContain('expected at least 400')
  })

  it('a renamed migrations directory is a failure, not a pass', () => {
    const f = makeFixture()
    rmSync(path.join(f.dir, 'supabase/migrations'), { recursive: true })
    mkdirSync(path.join(f.dir, 'supabase/migrations_v2'), { recursive: true })
    const { code, out } = run(f.dir)
    expect(code).not.toBe(0)
    expect(out).toContain('A gate cannot pass over nothing')
  })

  it('the live tree clears the table floor with headroom', () => {
    const { code, out } = run(ROOT)
    expect(code, out).toBe(0)
    const n = Number(/(\d+) live public table\(s\)/.exec(out)?.[1])
    expect(n).toBeGreaterThanOrEqual(MIN_LIVE_TABLES)
  })
})

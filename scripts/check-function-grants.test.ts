// Non-vacuity tests for the function-grant contract (LIVE-020, ADR-959).
//
// WHY THESE EXIST AND WHAT THEY ASSERT. A guard that only ever passes is this repo's named failure
// mode: `check:research-freshness` was described as a working advisory gate by four documents while
// running in no workflow and being structurally unable to fail (ADR-1011), and `check:og-trace`
// spent months matching nothing because its regex was anchored to a filename. So the bulk of this
// file does NOT check that the guard passes on the real tree — that proves almost nothing. It
// builds deliberately broken fixtures and asserts the guard FAILS, arm by arm, with the message
// that names the fix.
//
// It is spawned as a SUBPROCESS against a fixture cwd, matching scripts/backlog-contract.test.ts,
// because the thing under test is the exit code a workflow will read. The pure classifiers are
// imported directly where a unit assertion is sharper than an exit code.
//
// ⚠️ THE CENTRAL ARM IS `revoke ... from public` DOES NOT SATISFY `internal`. That single
// assertion is the reason LIVE-020 exists. Supabase's ALTER DEFAULT PRIVILEGES issues anon and
// authenticated EXPLICIT per-role grants, and revoking the pseudo-role PUBLIC leaves them
// untouched — the statement succeeds and removes nothing. The SQL reads correct, which is exactly
// why a human reading a diff cannot be the control. If that test ever goes green by being deleted
// or weakened, the guard is decorative.
//
// ⚠️ NO SUBPROCESS SPAWNS A SEARCH TOOL. Everything here is node reading files. This repo has been
// inverted five times by an instrument that could not tell "I looked and found nothing" from "I
// could not look" — an absent ripgrep flipped eight probes at once. The guard shells out to
// nothing, so there is nothing here that can silently answer the wrong question.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  arityOf,
  functionNamesIn,
  LOOP_REVOKES,
  namesAnonRole,
  parseLedger,
  RETIRED_BY_DYNAMIC_SQL,
  replay,
  splitTopLevel,
  stripSqlComments,
} from './check-function-grants.mjs'

const ROOT = process.cwd()
const GUARD = path.join(ROOT, 'scripts/check-function-grants.mjs')
const LEDGER = path.join(ROOT, 'scripts/function-grants.txt')
const MIGRATIONS = path.join(ROOT, 'supabase/migrations')

/** The guard's MIN_MIGRATIONS floor is 400, so every fixture tree needs ballast. Empty files can
 *  never satisfy an assertion by accident, which makes them the correct filler. */
const BALLAST = 405

type Fixture = { dir: string; add: (name: string, sql: string) => void; ledger: (text: string) => void }

function makeFixture(): Fixture {
  const dir = mkdtempSync(path.join(tmpdir(), 'fn-grants-'))
  mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true })
  mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  for (let i = 0; i < BALLAST; i++) {
    writeFileSync(path.join(dir, `supabase/migrations/${String(20200000000000 + i)}_ballast.sql`), '-- ballast\n')
  }
  return {
    dir,
    add: (name, sql) => writeFileSync(path.join(dir, 'supabase/migrations', name), sql),
    ledger: (text) => writeFileSync(path.join(dir, 'scripts/function-grants.txt'), text),
  }
}

/** Run the guard in `cwd`. Returns its exit code plus combined output. */
function run(cwd: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [GUARD], { cwd, encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, out }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

describe('check:function-grants — the arms that must FAIL', () => {
  let fx: Fixture
  beforeEach(() => {
    fx = makeFixture()
  })
  afterEach(() => rmSync(fx.dir, { recursive: true, force: true }))

  it('the control: a well-formed fixture PASSES, so a failure below means the arm, not the harness', () => {
    // Without this, every assertion of `code === 1` below could be satisfied by a fixture the guard
    // cannot read at all — "it failed" and "it never ran" are the same exit code. This is the
    // "I looked and it was fine" half of the pair.
    fx.add(
      '20260101000000_ok.sql',
      'create function public.open_rpc(_limit integer) returns setof record language sql as $$ select 1 $$;\n' +
        'create function public.shut_rpc() returns void language sql as $$ select 1 $$;\n' +
        'revoke execute on function public.shut_rpc() from public, anon, authenticated;\n',
    )
    fx.ledger('open_rpc  public\nshut_rpc  internal\n')
    const { code, out } = run(fx.dir)
    expect(out).toContain('✓ Function-grant contract')
    expect(code).toBe(0)
  })

  it('FAILS on a function with no ledger verdict at all', () => {
    fx.add(
      '20260101000000_new.sql',
      'create function public.unledgered_rpc(_id uuid) returns void language sql as $$ select 1 $$;\n',
    )
    fx.ledger('# nothing here\n')
    const { code, out } = run(fx.dir)
    expect(code).toBe(1)
    expect(out).toContain('no EXECUTE verdict for `unledgered_rpc`')
    expect(out).toContain('20260101000000_new.sql')
    // The message has to say what to write, or the gate is a riddle.
    expect(out).toContain('unledgered_rpc  internal')
    expect(out).toContain('it is `internal`')
  })

  it('FAILS on a ledger entry for a function that was dropped', () => {
    fx.add(
      '20260101000000_add.sql',
      'create function public.gone_rpc() returns void language sql as $$ select 1 $$;\n',
    )
    fx.add('20260102000000_drop.sql', 'drop function if exists public.gone_rpc();\n')
    fx.ledger('gone_rpc  internal\n')
    const { code, out } = run(fx.dir)
    expect(code).toBe(1)
    expect(out).toContain('stale ledger entry `gone_rpc`')
  })

  // ── THE ARM THIS WHOLE GUARD EXISTS FOR ────────────────────────────────────────────────────
  it('FAILS an `internal` verdict backed ONLY by `revoke ... from public` (ADR-959)', () => {
    fx.add(
      '20260101000000_looks_locked.sql',
      'create function public.secret_rpc(_id uuid) returns void language sql security definer as $$ select 1 $$;\n' +
        '-- This statement runs, succeeds, and removes nothing.\n' +
        'revoke execute on function public.secret_rpc(uuid) from public;\n' +
        'grant execute on function public.secret_rpc(uuid) to service_role;\n',
    )
    fx.ledger('secret_rpc  internal\n')
    const { code, out } = run(fx.dir)
    expect(code).toBe(1)
    expect(out).toContain('`secret_rpc` is marked `internal` but anon can still execute it')
    // It must not merely fail — it must say WHY the revoke that is right there does not count,
    // and point at the file, or the next author "fixes" it by adding a second one just like it.
    expect(out).toContain('IT HAS A REVOKE, AND THE REVOKE REMOVES NOTHING')
    expect(out).toContain('20260101000000_looks_locked.sql')
    expect(out).toContain('from public, anon, authenticated')
  })

  it('PASSES the same function once the revoke NAMES the role', () => {
    // The other half of the pair. Without it, the arm above could be passing because the guard
    // rejects every `internal` verdict, which would be a different bug wearing the same exit code.
    fx.add(
      '20260101000000_locked.sql',
      'create function public.secret_rpc(_id uuid) returns void language sql security definer as $$ select 1 $$;\n' +
        'revoke execute on function public.secret_rpc(uuid) from public, anon, authenticated;\n',
    )
    fx.ledger('secret_rpc  internal\n')
    const { code, out } = run(fx.dir)
    expect(out).toContain('✓ Function-grant contract')
    expect(code).toBe(0)
  })

  it('FAILS an `authenticated` verdict with no anon revoke — a definer function has no RLS behind it', () => {
    fx.add(
      '20260101000000_authed.sql',
      'create function public.member_rpc() returns void language sql security definer as $$ select 1 $$;\n',
    )
    fx.ledger('member_rpc  authenticated\n')
    const { code, out } = run(fx.dir)
    expect(code).toBe(1)
    expect(out).toContain('`member_rpc` is marked `authenticated` but anon can still execute it')
    expect(out).toContain('No revoke names `anon`')
  })

  it('FAILS when a later migration GRANTS the revoke back to anon', () => {
    // A set-union reading of these two files reports the function as revoked. It is not.
    fx.add(
      '20260101000000_revoke.sql',
      'create function public.flip_rpc() returns void language sql as $$ select 1 $$;\n' +
        'revoke execute on function public.flip_rpc() from public, anon, authenticated;\n',
    )
    fx.add('20260102000000_regrant.sql', 'grant execute on function public.flip_rpc() to anon, authenticated;\n')
    fx.ledger('flip_rpc  internal\n')
    const { code, out } = run(fx.dir)
    expect(code).toBe(1)
    expect(out).toContain('`flip_rpc` is marked `internal` but anon can still execute it')
    expect(out).toContain('IT WAS REVOKED, AND THEN GRANTED BACK')
    expect(out).toContain('20260102000000_regrant.sql')
  })

  it('FAILS when a function is re-created after its revoke — drop + create resets the ACL', () => {
    fx.add(
      '20260101000000_v1.sql',
      'create function public.rebuilt_rpc() returns void language sql as $$ select 1 $$;\n' +
        'revoke execute on function public.rebuilt_rpc() from public, anon, authenticated;\n',
    )
    fx.add(
      '20260102000000_v2.sql',
      'drop function if exists public.rebuilt_rpc();\n' +
        'create function public.rebuilt_rpc() returns void language sql as $$ select 2 $$;\n',
    )
    fx.ledger('rebuilt_rpc  internal\n')
    const { code, out } = run(fx.dir)
    expect(code).toBe(1)
    expect(out).toContain('`rebuilt_rpc` is marked `internal` but anon can still execute it')
  })

  it('FAILS on an unparseable ledger line rather than skipping it', () => {
    fx.add('20260101000000_x.sql', 'create function public.x_rpc() returns void language sql as $$ select 1 $$;\n')
    fx.ledger('x_rpc  internal\nx_rpc_two  servicerole\n')
    const { code, out } = run(fx.dir)
    expect(code).toBe(1)
    expect(out).toContain('unparseable ledger line')
  })

  it('FAILS on a truncated migration directory instead of passing over nothing', () => {
    const small = mkdtempSync(path.join(tmpdir(), 'fn-grants-small-'))
    mkdirSync(path.join(small, 'supabase/migrations'), { recursive: true })
    mkdirSync(path.join(small, 'scripts'), { recursive: true })
    writeFileSync(path.join(small, 'supabase/migrations/20260101000000_only.sql'), '-- one file\n')
    writeFileSync(path.join(small, 'scripts/function-grants.txt'), '# empty\n')
    const { code, out } = run(small)
    rmSync(small, { recursive: true, force: true })
    expect(code).toBe(1)
    expect(out).toContain('expected at least')
  })

  it('FAILS when the ledger file is missing entirely', () => {
    fx.add('20260101000000_x.sql', 'create function public.x_rpc() returns void language sql as $$ select 1 $$;\n')
    const { code, out } = run(fx.dir)
    expect(code).toBe(1)
    expect(out).toContain('A gate cannot pass over nothing')
  })
})

describe('the parser sees what the SQL actually says', () => {
  it('a comment quoting `revoke ... from public` is not a revoke', () => {
    // Three migrations in this tree quote the broken idiom in their headers to explain why it does
    // not work. A parser that counts those has credited the exact statement the gate rejects.
    const sql =
      '-- revoke execute on function public.trap_rpc() from public, anon;\n' +
      'create function public.trap_rpc() returns void language sql as $$ select 1 $$;\n'
    const live = replay([{ name: '20260101000000_a.sql', text: sql }])
    expect(live.get('trap_rpc')?.anonRevoked).toBe(false)
  })

  it('a block-comment rollback script is not real SQL', () => {
    const sql =
      'create function public.kept_rpc() returns void language sql as $$ select 1 $$;\n' +
      '/* DOWN:\n   drop function if exists public.kept_rpc();\n*/\n'
    expect(stripSqlComments(sql)).not.toContain('drop function')
    expect(replay([{ name: '20260101000000_a.sql', text: sql }]).has('kept_rpc')).toBe(true)
  })

  it('reads every function in a multi-function revoke, not just the first', () => {
    // 20260604030000 revokes five admin RPCs in one statement. A single-name regex saw one of them
    // and four SECURITY DEFINER functions read as un-revoked while their revoke sat in the file.
    const sql =
      'create function public.a_rpc(_n integer) returns void language sql as $$ select 1 $$;\n' +
      'create function public.b_rpc() returns void language sql as $$ select 1 $$;\n' +
      'create function public.c_rpc(_x integer, _y integer) returns void language sql as $$ select 1 $$;\n' +
      'revoke execute on function\n' +
      '  public.a_rpc(int), public.b_rpc(), public.c_rpc(int,int)\n' +
      '  from public, anon, authenticated;\n'
    const live = replay([{ name: '20260101000000_a.sql', text: sql }])
    for (const fn of ['a_rpc', 'b_rpc', 'c_rpc']) expect(live.get(fn)?.anonRevoked, fn).toBe(true)
  })

  it('dropping ONE overload does not erase the function', () => {
    // `record_qr_scan`: 20270104000000 drops its 7-argument signature, and the 8-argument one is
    // still live in production. A name-granular model dropped it out of the bijection entirely.
    const sql =
      'create function public.over_rpc(a uuid, b uuid) returns void language sql as $$ select 1 $$;\n' +
      'create function public.over_rpc(a uuid, b uuid, c text) returns void language sql as $$ select 1 $$;\n' +
      'drop function if exists public.over_rpc(uuid, uuid);\n'
    expect(replay([{ name: '20260101000000_a.sql', text: sql }]).has('over_rpc')).toBe(true)
  })

  it('`drop function` with no argument list removes every signature', () => {
    const sql =
      'create function public.gone_rpc(a uuid) returns void language sql as $$ select 1 $$;\n' +
      'drop function if exists public.gone_rpc;\n'
    expect(replay([{ name: '20260101000000_a.sql', text: sql }]).has('gone_rpc')).toBe(false)
  })

  it('a create AFTER a drop in the SAME file leaves the function live', () => {
    // The first parser processed all creates, then all drops, per file — and lost nine real
    // functions to migrations shaped exactly like this one.
    const sql =
      'drop function if exists public.same_file_rpc(uuid);\n' +
      'create function public.same_file_rpc(a uuid) returns void language sql as $$ select 1 $$;\n'
    expect(replay([{ name: '20260101000000_a.sql', text: sql }]).has('same_file_rpc')).toBe(true)
  })

  it('`create trigger ... execute function f()` is not a function definition', () => {
    const sql = 'create trigger trg_x after insert on public.t for each row execute function public.f();\n'
    expect(replay([{ name: '20260101000000_a.sql', text: sql }]).size).toBe(0)
  })

  it('a function created in another schema is not a public function', () => {
    const sql = 'create function private.helper_rpc() returns void language sql as $$ select 1 $$;\n'
    expect(replay([{ name: '20260101000000_a.sql', text: sql }]).has('helper_rpc')).toBe(false)
  })

  it('`alter function ... set schema private` retires it from public', () => {
    const sql =
      'create function public.moved_rpc() returns void language sql as $$ select 1 $$;\n' +
      'alter function public.moved_rpc() set schema private;\n'
    expect(replay([{ name: '20260101000000_a.sql', text: sql }]).has('moved_rpc')).toBe(false)
  })

  it('namesAnonRole distinguishes the ROLE from the pseudo-role', () => {
    expect(namesAnonRole('public')).toBe(false)
    expect(namesAnonRole('public, anon, authenticated')).toBe(true)
    expect(namesAnonRole('anon')).toBe(true)
    expect(namesAnonRole('authenticated, service_role')).toBe(false)
    // A role whose name merely contains "anon" is not `anon`.
    expect(namesAnonRole('anonymous_reader')).toBe(false)
  })

  it('splitTopLevel keeps argument lists together', () => {
    expect(splitTopLevel('a(int,int), b(), c(uuid)').map((s) => s.trim())).toEqual(['a(int,int)', 'b()', 'c(uuid)'])
  })

  it('arityOf counts parameters, and an empty list is zero', () => {
    expect(arityOf('')).toBe(0)
    expect(arityOf('  ')).toBe(0)
    expect(arityOf('a uuid')).toBe(1)
    expect(arityOf('a numeric(10,2), b text default null')).toBe(2)
  })

  it('functionNamesIn reports a missing argument list as null, not as zero', () => {
    // `drop function public.f` means every signature; `drop function public.f()` means one.
    expect(functionNamesIn('public.f')).toEqual([{ name: 'f', arity: null }])
    expect(functionNamesIn('public.f()')).toEqual([{ name: 'f', arity: 0 }])
  })

  it('parseLedger rejects a verdict outside the three', () => {
    const { entries, bad } = parseLedger('good_rpc  internal\nbad_rpc  admin_only\n')
    expect(entries.has('good_rpc')).toBe(true)
    expect(bad).toHaveLength(1)
  })
})

describe('the real tree', () => {
  // Deliberately thin. These assert the guard is WIRED to something real and non-empty; the
  // evidence that it can FAIL is every fixture above. A suite made only of real-tree assertions is
  // the shape that passed for months while measuring nothing.
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, text: readFileSync(path.join(MIGRATIONS, f), 'utf8') }))

  it('reads a real migration tree', () => {
    expect(files.length).toBeGreaterThan(400)
  })

  it('finds a substantial set of live public functions', () => {
    // The non-triviality floor. A parse that silently returned {} would make every bijection check
    // below vacuous. Measured 148 on 2026-08-17, matching the production catalog exactly.
    expect(replay(files).size).toBeGreaterThan(100)
  })

  it('every ledger verdict is one of the three, and the ledger is not empty', () => {
    const { entries, bad } = parseLedger(readFileSync(LEDGER, 'utf8'))
    expect(bad).toEqual([])
    expect(entries.size).toBeGreaterThan(100)
  })

  it('the guard exits 0 on the tree as committed', () => {
    const { code, out } = run(ROOT)
    expect(out).toContain('✓ Function-grant contract')
    expect(code).toBe(0)
  })

  it('every LOOP_REVOKES migration exists, so the claim about catalog loops cannot rot', () => {
    // The guard gives a `do $$` loop no credit and says so in its header. This is what keeps that
    // sentence pointing at real files. It lives here rather than in the CLI because it is a fact
    // about the REAL tree; asserting it inside the guard would fail every fixture.
    const names = new Set(files.map((f) => f.name))
    expect(LOOP_REVOKES.length).toBeGreaterThan(0)
    for (const file of LOOP_REVOKES) expect(names.has(file), file).toBe(true)
  })

  it('every RETIRED_BY_DYNAMIC_SQL entry names a migration that exists and really moves it', () => {
    const byName = new Map(files.map((f) => [f.name, f.text]))
    const entries = Object.entries(RETIRED_BY_DYNAMIC_SQL)
    expect(entries.length).toBeGreaterThan(0)
    for (const [fn, file] of entries) {
      expect(byName.has(file), `${fn} -> ${file}`).toBe(true)
      expect(byName.get(file)).toMatch(/set\s+schema\s+private/i)
    }
  })

  it('no RETIRED_BY_DYNAMIC_SQL entry is also carrying a ledger verdict', () => {
    // Belt and braces on the bijection: an entry in both places would let a function be hidden
    // from the live set AND declared safe, which is two ways of not being checked.
    const { entries } = parseLedger(readFileSync(LEDGER, 'utf8'))
    for (const fn of Object.keys(RETIRED_BY_DYNAMIC_SQL)) expect(entries.has(fn), fn).toBe(false)
  })

  it('states what it cannot see, every time it passes', () => {
    // A gate that reports "all clear" without saying what it did not measure is how a green run
    // starts standing in for a safe database. This one always prints the caveat.
    const { out } = run(ROOT)
    expect(out).toContain('NOT the database')
  })
})

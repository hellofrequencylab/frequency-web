import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  ALLOWLIST,
  MIN_CHAINS,
  MIN_FILES,
  MIN_RPC_CALLS,
  applyAllowlist,
  floorFailure,
  scanSchemaContract,
  violationsOf,
} from './check-schema-contract.mjs'

// The schema <-> code contract guard (scan 2, 2026-09-05, L1-01 / ADR-1207), proven both ways.
//
// A guard that only ever passes on the real tree proves almost nothing: `check:og-trace` matched
// nothing for weeks because its regex was anchored to a filename, and every run was green. So the
// centre of this file is a PLANTED violation: a fixture tree that reproduces the exact shape of the
// production defect (an untyped builder addressed through `TABLE[ref.type]`, writing `updated_at`
// to `campaigns`, which has no such column) and asserts the guard names the file, the line and the
// column. The clean twin of that fixture then proves the non-triviality floor: a tiny tree with no
// phantoms is exit 2 ("saw nothing"), never exit 0.
//
// The CLI is spawned as a subprocess for the exit codes a workflow reads; the scanner is imported
// directly where a unit assertion is sharper than an exit code.

const ROOT = process.cwd()
const GUARD = path.join(ROOT, 'scripts/check-schema-contract.mjs')

/** A small generated-types contract in the exact shape supabase gen emits. `campaigns` has NO
 *  `updated_at`, which is the whole point. */
const TYPES = `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"]
          created_at: string
          id: string
          name: string
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          display_name: string | null
          id: string
        }
        Insert: {
          display_name?: string | null
          id?: string
        }
        Update: {
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {
      get_my_group_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      approval_status: "draft" | "ready" | "approved"
    }
    CompositeTypes: {}
  }
}
`

/** lib/outbound/db.ts as it stands: a hand-written untyped builder keyed on a string table name. */
const DB = `export function outboundDb(): { from(table: string): any } {
  return {} as unknown as { from(table: string): any }
}
`

/** The approval spine's shape. The chain starts on line 5 (\`await outboundDb()\`), the
 *  \`.from(TABLE[ref.type])\` sits on line 6 and the phantom rides on the update below it; the guard
 *  reports a chain at the line where it STARTS, which is what a reader opens the file at. */
function approvals(withPhantom: boolean): string {
  const patch = withPhantom
    ? "{ approval_status: 'ready', updated_at: new Date().toISOString() }"
    : "{ approval_status: 'ready' }"
  return `import { outboundDb } from './db'
type ApprovableType = 'campaign'
const TABLE: Record<ApprovableType, string> = { campaign: 'campaigns' }
export async function markReady(ref: { type: ApprovableType; id: string }) {
  const { error } = await outboundDb()
    .from(TABLE[ref.type])
    .update(${patch})
    .eq('id', ref.id)
  return error
}
`
}

/** A genuinely dynamic table name: nothing resolves \`name\`, so the guard must SKIP it, counted. */
const DYNAMIC = `export function rows(db: { from(t: string): any }, name: string) {
  return db.from(name).select('*')
}
`

/** A typed-looking clean query, so the fixture also carries columns that DO resolve. */
function page(withUnknownRpc: boolean): string {
  return `declare const db: any
export async function load(id: string) {
  const { data } = await db.from('profiles').select('id, display_name').eq('id', id).maybeSingle()
  await db.from('campaigns').insert({ name: 'x', approval_status: 'draft' })
  ${withUnknownRpc ? "await db.rpc('no_such_fn', { a: 1 })" : "await db.rpc('get_my_group_ids')"}
  return data
}
`
}

type Fixture = { dir: string }

function makeFixture(planted: boolean): Fixture {
  const dir = mkdtempSync(path.join(tmpdir(), 'schema-contract-'))
  const write = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  write('lib/database.types.ts', TYPES)
  write('lib/outbound/db.ts', DB)
  write('lib/outbound/approvals.ts', approvals(planted))
  write('lib/dynamic.ts', DYNAMIC)
  write('app/page.ts', page(planted))
  return { dir }
}

function runCli(root: string) {
  const res = spawnSync(process.execPath, [GUARD, '--root', root], { cwd: ROOT, encoding: 'utf8' })
  return { code: res.status ?? -1, out: `${res.stdout}\n${res.stderr}` }
}

const fixtures: Fixture[] = []
afterAll(() => {
  for (const f of fixtures) rmSync(f.dir, { recursive: true, force: true })
})

describe('the planted L1-01 shape: an untyped builder writing a column that does not exist', () => {
  let planted: Fixture
  beforeAll(() => {
    planted = makeFixture(true)
    fixtures.push(planted)
  })

  it('names the file, the line and the column, through TABLE[ref.type] on an untyped builder', () => {
    const report = scanSchemaContract({ root: planted.dir })
    const v = violationsOf(report)
    expect(v).toContainEqual(
      expect.objectContaining({ file: 'lib/outbound/approvals.ts', line: 5, kind: 'update', table: 'campaigns', column: 'updated_at' }),
    )
    // The chain was RESOLVED, not skipped: a dynamic-table skip on this file would be the blind
    // spot the production defect lived in.
    expect(report.skippedSites.filter((s) => s.file === 'lib/outbound/approvals.ts')).toEqual([])
  })

  it('names an rpc the contract does not declare', () => {
    const v = violationsOf(scanSchemaContract({ root: planted.dir }))
    expect(v).toContainEqual(expect.objectContaining({ file: 'app/page.ts', kind: 'rpc', table: 'no_such_fn' }))
    // Exactly the two plants and nothing else: the clean chains beside them must not be noise.
    expect(v).toHaveLength(2)
  })

  it('skips the genuinely dynamic table name with a counted reason rather than crashing', () => {
    const report = scanSchemaContract({ root: planted.dir })
    expect(report.skipped.dynamicTable).toBe(1)
    expect(report.skippedSites).toContainEqual(expect.objectContaining({ file: 'lib/dynamic.ts', line: 2, reason: 'dynamicTable' }))
  })

  it('still counts the columns that DO resolve, so the skip is a skip and not a blind eye', () => {
    const { stats } = scanSchemaContract({ root: planted.dir }).meta
    expect(stats.selectCols).toBeGreaterThanOrEqual(2) // id, display_name
    expect(stats.writeKeys).toBeGreaterThanOrEqual(4) // name, approval_status, approval_status, updated_at
    expect(stats.enumValues).toBeGreaterThanOrEqual(2) // 'draft', 'ready'
  })

  it('exits 1 from the CLI and prints file:line plus the phantom name', () => {
    const { code, out } = runCli(planted.dir)
    expect(code).toBe(1)
    expect(out).toContain('lib/outbound/approvals.ts:5')
    expect(out).toContain('campaigns.updated_at')
    expect(out).toContain("unknown rpc 'no_such_fn'")
    // The skip is REPORTED on the failing run too, as a count, so a reader can see what was not measured.
    expect(out).toMatch(/1 dynamic table name/)
  })

  it('an ALLOWLIST entry covers exactly one named site, and a stale entry is itself a failure', () => {
    const v = violationsOf(scanSchemaContract({ root: planted.dir }))
    const entry = { file: 'lib/outbound/approvals.ts', table: 'campaigns', column: 'updated_at', added: '2026-09-05', reason: 'test', owner: 'PE-1' }
    const covered = applyAllowlist(v, [entry])
    expect(covered.allowed).toBe(1)
    expect(covered.stale).toEqual([])
    expect(covered.remaining.map((x) => x.kind)).toEqual(['rpc'])

    const stale = applyAllowlist(v, [{ ...entry, column: 'never_there' }])
    expect(stale.allowed).toBe(0)
    expect(stale.stale).toHaveLength(1)
    expect(stale.remaining).toHaveLength(2)
  })
})

describe('the clean twin: a tiny tree with no phantoms is "saw nothing", never a pass', () => {
  let clean: Fixture
  beforeAll(() => {
    clean = makeFixture(false)
    fixtures.push(clean)
  })

  it('finds no phantom in the same tree once the plants are removed', () => {
    const report = scanSchemaContract({ root: clean.dir })
    expect(violationsOf(report)).toEqual([])
    expect(report.meta.fromChains).toBe(4)
    expect(report.meta.rpcCalls).toBe(1)
  })

  it('fails the non-triviality floor and says which number is short', () => {
    const msg = floorFailure(scanSchemaContract({ root: clean.dir }))
    expect(msg).toMatch(/saw nothing/)
    expect(msg).toContain(`floor ${MIN_FILES}`)
    expect(msg).toContain(`floor ${MIN_CHAINS}`)
    expect(msg).toContain(`floor ${MIN_RPC_CALLS}`)
  })

  it('exits 2 from the CLI, a code distinct from a phantom (1) and from clean (0)', () => {
    const { code, out } = runCli(clean.dir)
    expect(code).toBe(2)
    expect(out).toMatch(/saw nothing/)
  })

  it('exits 2 when the contract itself cannot be read', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'schema-contract-'))
    fixtures.push({ dir })
    const { code, out } = runCli(dir)
    expect(code).toBe(2)
    expect(out).toMatch(/could not read the contract/)
  })
})

describe('the live tree', () => {
  // One walk, shared: ~10 s on the real tree, so it is measured once and asserted several times.
  let report: ReturnType<typeof scanSchemaContract>
  // The hook timeout is explicit: vitest's default is 10 s, and a 2-core CI runner sharing the
  // machine with other workers can take that long on the walk alone.
  beforeAll(() => {
    report = scanSchemaContract({ root: ROOT })
  }, 120_000)

  it('clears every floor with headroom, so the floors are real and not decorative', () => {
    expect(floorFailure(report)).toBeNull()
    expect(report.meta.filesScanned).toBeGreaterThanOrEqual(MIN_FILES)
    expect(report.meta.fromChains).toBeGreaterThanOrEqual(MIN_CHAINS)
    expect(report.meta.rpcCalls).toBeGreaterThanOrEqual(MIN_RPC_CALLS)
  })

  it('has no phantom table, column, rpc or enum value outside the named allowlist, and no stale entry', () => {
    const { remaining, stale } = applyAllowlist(violationsOf(report))
    const lines = remaining.map((v) => `  ${v.file}:${v.line}  ${v.message}`).join('\n')
    expect(remaining, `\n${lines}\n`).toEqual([])
    expect(stale, 'an ALLOWLIST entry matches nothing; remove it').toEqual([])
  })

  it('every allowlist entry is named, dated and owned', () => {
    for (const a of ALLOWLIST) {
      expect(a.file).toBeTruthy()
      expect(a.table).toBeTruthy()
      expect(a.added).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(a.reason).toBeTruthy()
      expect(a.owner).toBeTruthy()
    }
  })

  it('resolves the approval spine through TABLE[ref.type] rather than skipping it', () => {
    // This is the production path the guard exists for. If the spine ever reads as a dynamic-table
    // skip, the guard has gone blind on the one file it was written to watch.
    expect(report.skippedSites.filter((s) => s.file === 'lib/outbound/approvals.ts' && s.reason === 'dynamicTable')).toEqual([])
  })
})

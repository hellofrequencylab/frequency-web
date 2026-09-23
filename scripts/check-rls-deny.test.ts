import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  audit,
  candidateClasses,
  parseDenyTestRoster,
  parseMatrixTest,
  parseSurface,
  parseTypes,
  scanPolicies,
  MIN_CLASSED,
  MIN_LIVE_TABLES,
  MIN_MIGRATIONS,
} from './check-rls-deny.mjs'

// Self-test for the deny-matrix guard (HYG-100). Every arm is driven twice: once against a
// fixture built to BREAK it, and once against the real tree. A guard whose failure modes are
// never exercised is a guard that can rot into a green light, which is the whole reason the
// money/trust/Vera surface needed one in the first place.

const ROOT = path.join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

/** A minimal but REAL-SHAPED types file: the parser keys off `Tables: {` … `Views: {`. */
function typesFile(tables: Record<string, string[]>): string {
  const body = Object.entries(tables)
    .map(
      ([t, cols]) =>
        `      ${t}: {\n        Row: {\n${cols.map((c) => `          ${c}: string | null`).join('\n')}\n        }\n      }`,
    )
    .join('\n')
  return `export type Database = {\n  public: {\n    Tables: {\n${body}\n    }\n    Views: {\n    }\n  }\n}\n`
}

const matrixSql = (rows: [string, string][]) =>
  `insert into _deny_matrix (tbl, denied) values\n` +
  rows.map(([t, d]) => `  ('${t}', '${d}')`).join(',\n') +
  ';\n'

const rosterSql = (tables: string[]) =>
  `-- ROSTER BEGIN\n${tables.map((t) => `--   ${t}`).join('\n')}\n-- ROSTER END\n`

describe('parseTypes', () => {
  it('reads the live table → column map out of a generated types file', () => {
    const tables = parseTypes(typesFile({ tips: ['id', 'amount_cents'], posts: ['id', 'body'] }))
    expect([...tables.keys()].sort()).toEqual(['posts', 'tips'])
    expect([...tables.get('tips')!]).toContain('amount_cents')
  })

  it('returns an empty map rather than guessing when the Tables block is absent', () => {
    expect(parseTypes('export type Database = {}').size).toBe(0)
  })
})

describe('candidateClasses', () => {
  it('catches money by COLUMN even when the table name says nothing', () => {
    expect(candidateClasses('quiet_table', new Set(['id', 'amount_cents']))).toContain('money')
    expect(candidateClasses('quiet_table', new Set(['id', 'stripe_account_id']))).toContain('money')
    expect(candidateClasses('quiet_table', new Set(['id', 'body']))).toEqual([])
  })

  it('catches trust and Vera by NAME', () => {
    expect(candidateClasses('trust_scores', new Set(['id']))).toContain('trust')
    expect(candidateClasses('space_standing', new Set(['id']))).toContain('trust')
    expect(candidateClasses('vera_config', new Set(['id']))).toContain('vera')
  })
})

describe('scanPolicies', () => {
  it('reports the commands a table ENDS with, replaying drop/create in statement order', () => {
    const { rls, allowed } = scanPolicies(`
      create table ledger (id uuid);
      alter table ledger enable row level security;
      create policy ledger_read on ledger for select using (true);
      create policy ledger_write on ledger for insert with check (true);
      drop policy ledger_write on ledger;
    `).get('ledger')!
    expect(rls).toBe(true)
    expect([...allowed].sort()).toEqual(['select'])
  })

  it('counts a policy with no `for` clause as all four commands, which is what Postgres does', () => {
    const { allowed } = scanPolicies(`
      create table t (id uuid);
      create policy t_all on t using (true);
    `).get('t')!
    expect([...allowed].sort()).toEqual(['delete', 'insert', 'select', 'update'])
  })

  it('does NOT count a RESTRICTIVE policy as opening a command', () => {
    // A restrictive policy only ever narrows a permissive one. Counting it would let a guard read
    // as "update is allowed here" on a table where nothing permissive allows update at all.
    const { allowed } = scanPolicies(`
      create table t (id uuid);
      create policy t_guard on t as restrictive for update using (false);
    `).get('t')!
    expect([...allowed]).toEqual([])
  })

  it('carries RLS and policies across a rename, and forgets a dropped table', () => {
    const scanned = scanPolicies(`
      create table old_name (id uuid);
      alter table old_name enable row level security;
      create policy p on old_name for select using (true);
      alter table old_name rename to new_name;
      create table gone (id uuid);
      drop table if exists gone;
    `)
    expect(scanned.has('old_name')).toBe(false)
    expect(scanned.has('gone')).toBe(false)
    expect([...scanned.get('new_name')!.allowed]).toEqual(['select'])
  })

  it('does not read DDL out of a block comment (the rollback-script shape)', () => {
    const scanned = scanPolicies(`
      create table kept (id uuid);
      /* ROLLBACK: drop table if exists kept; */
    `)
    expect(scanned.has('kept')).toBe(true)
  })
})

describe('parseSurface', () => {
  it('rejects an unknown class and an unknown command rather than ignoring the line', () => {
    expect(parseSurface('t vibes -').errors[0]).toMatch(/is not one of/)
    expect(parseSurface('t money truncate').errors[0]).toMatch(/is not a SQL command/)
    expect(parseSurface('t money insert\nt trust delete').errors[0]).toMatch(/already has a verdict/)
  })

  it('reads "-" as an empty deny list and strips comments', () => {
    const { rows, errors } = parseSurface('# a note\nspaces carrier -   # trailing\n')
    expect(errors).toEqual([])
    expect(rows.get('spaces')).toEqual({ klass: 'carrier', denied: [] })
  })
})

describe('parseMatrixTest', () => {
  it('reads only the VALUES block, not prose in the header that looks like a pair', () => {
    const sql =
      `-- Kept as ('table', 'denied,commands') pairs.\n` + matrixSql([['tips', 'insert,update']])
    const parsed = parseMatrixTest(sql)
    expect([...parsed.keys()]).toEqual(['tips'])
    expect(parsed.get('tips')).toEqual(['insert', 'update'])
  })
})

describe('parseDenyTestRoster', () => {
  it('reads the declared roster and nothing else', () => {
    expect(parseDenyTestRoster(`-- unrelated\n${rosterSql(['tips', 'spaces'])}--   decoy\n`)).toEqual([
      'tips',
      'spaces',
    ])
  })
})

describe('audit -- every failure arm fires', () => {
  const base = {
    types: typesFile({ tips: ['id', 'amount_cents'], posts: ['id', 'body'] }),
    policies: scanPolicies(`
      create table tips (id uuid);
      alter table tips enable row level security;
      create policy tips_read on tips for select using (true);
    `),
    surface: 'tips money insert,update,delete\n',
    matrixTest: parseMatrixTest(matrixSql([['tips', 'insert,update,delete']])),
    denyRoster: ['tips'],
  }

  it('is green on a consistent fixture, so the red arms below mean something', () => {
    expect(audit(base).failures).toEqual([])
  })

  it('fails when a money-shaped table has no verdict (the census cannot silently grow)', () => {
    const types = typesFile({
      tips: ['id', 'amount_cents'],
      new_payouts: ['id', 'amount_cents'],
    })
    expect(audit({ ...base, types }).failures.join('\n')).toMatch(
      /new_payouts looks like a money .* and has no verdict/,
    )
  })

  it('fails when a verdict names a table that is no longer live', () => {
    const surface = base.surface + 'retired_ledger money select,insert,update,delete\n'
    expect(audit({ ...base, surface }).failures.join('\n')).toMatch(/retired_ledger[\s\S]*Delete the line/)
  })

  it('fails when a migration ADDS a policy on a denied command (the space_vera_changes shape)', () => {
    // The exact regression this gate exists for: the append-only Vera change log gains an update
    // policy and the record of what Vera did to a calendar becomes editable.
    const policies = scanPolicies(`
      create table tips (id uuid);
      alter table tips enable row level security;
      create policy tips_read on tips for select using (true);
      create policy tips_edit on tips for update using (true);
    `)
    expect(audit({ ...base, policies }).failures.join('\n')).toMatch(
      /tips: the deny matrix moved[\s\S]*A policy now ALLOWS update/,
    )
  })

  it('fails the OTHER way when a table loses the last policy on an allowed command', () => {
    const policies = scanPolicies(`
      create table tips (id uuid);
      alter table tips enable row level security;
      create policy tips_read on tips for select using (true);
      drop policy tips_read on tips;
    `)
    expect(audit({ ...base, policies }).failures.join('\n')).toMatch(
      /select lost its last policy[\s\S]*read going dark/,
    )
  })

  it('fails when a classed table has RLS off', () => {
    const policies = scanPolicies(`
      create table tips (id uuid);
      create policy tips_read on tips for select using (true);
    `)
    expect(audit({ ...base, policies }).failures.join('\n')).toMatch(/no migration enables RLS on it/)
  })

  it('fails when the pgTAP matrix never names a classed table', () => {
    expect(audit({ ...base, matrixTest: new Map() }).failures.join('\n')).toMatch(
      /never names it, so no database is ever asked/,
    )
  })

  it('fails when the pgTAP matrix disagrees with the verdict file', () => {
    const matrixTest = parseMatrixTest(matrixSql([['tips', 'insert,update']]))
    expect(audit({ ...base, matrixTest }).failures.join('\n')).toMatch(/One of them is wrong/)
  })

  it('fails when the behavioral test seeds a table nobody classed', () => {
    expect(audit({ ...base, denyRoster: ['posts'] }).failures.join('\n')).toMatch(
      /seeds posts, which is not a classed/,
    )
  })

  it('does not demand a deny matrix from a carrier verdict', () => {
    const surface = 'tips carrier -\n'
    expect(audit({ ...base, surface, matrixTest: new Map(), denyRoster: [] }).failures).toEqual([])
  })
})

describe('the real tree', () => {
  const files = readdirSync(path.join(ROOT, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const result = audit({
    types: read('lib/database.types.ts'),
    policies: scanPolicies(files.map((f) => read(path.join('supabase', 'migrations', f)))),
    surface: read('scripts/rls-deny-surface.txt'),
    matrixTest: parseMatrixTest(read('supabase/tests/money_trust_vera_policy_matrix.test.sql')),
    denyRoster: parseDenyTestRoster(read('supabase/tests/money_trust_vera_deny.test.sql')),
  })

  it('the committed tree passes the guard', () => {
    expect(result.failures).toEqual([])
  })

  it('classed enough tables to be worth running, and cleared every floor', () => {
    expect(files.length).toBeGreaterThanOrEqual(MIN_MIGRATIONS)
    expect(result.liveCount).toBeGreaterThanOrEqual(MIN_LIVE_TABLES)
    expect(result.classed.length).toBeGreaterThanOrEqual(MIN_CLASSED)
  })

  it('names the tables HYG-100 was filed about', () => {
    // The row names money, trust_scores and the Vera tables by hand. If a refactor ever drops one
    // of these from the census, the guard would still be green and would be guarding less.
    for (const t of [
      'financial_transactions',
      'trust_scores',
      'trust_signals',
      'vera_config',
      'vera_dispatches',
      'vera_autonomy_decisions',
      'space_vera_changes',
    ]) {
      expect(result.classed, `${t} left the classed census`).toContain(t)
    }
  })

  it('leaves spatial_ref_sys alone (OPEN-THREADS A6: PostGIS system table, skip)', () => {
    expect(result.classed).not.toContain('spatial_ref_sys')
    expect(read('scripts/rls-deny-surface.txt')).not.toMatch(/spatial_ref_sys/)
  })

  it('pins the append-only shape of the Vera change log', () => {
    const { rows } = parseSurface(read('scripts/rls-deny-surface.txt'))
    expect(rows.get('space_vera_changes')).toEqual({ klass: 'vera', denied: ['update', 'delete'] })
  })

  it('the pgTAP files plan exactly as many assertions as they make', () => {
    for (const file of [
      'supabase/tests/money_trust_vera_policy_matrix.test.sql',
      'supabase/tests/money_trust_vera_deny.test.sql',
    ]) {
      const sql = read(file)
      const planned = Number(/select plan\((\d+)\)/.exec(sql)![1])
      const made = sql.match(/^select (is_empty|throws_ok|results_eq|lives_ok|is)\(/gm)?.length ?? 0
      expect(made, `${file} plans ${planned} assertions and makes ${made}`).toBe(planned)
    }
  })
})

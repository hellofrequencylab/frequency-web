#!/usr/bin/env node
// check:rls-deny -- THE DENY MATRIX for the money, trust and Vera tables (HYG-100).
//
// WHY THIS EXISTS. check:rls proves a table has RLS on and at least one policy standing.
// check:grants proves a table carries a deliberate grant verdict. Neither says WHICH COMMANDS a
// non-owner is refused, and that is the only question anyone actually asks about a ledger row, a
// trust score or a Vera record: can somebody who is not the owner read it, write it, change it,
// or make it go away. On 2026-09-19 the answer lived nowhere a machine could read it, so HYG-100
// was filed as a manual audit -- "prove RLS deny on money/trust/Vera" -- and a manual audit is one
// nobody re-runs after the next migration.
//
// WHAT IT ENFORCES, all from the tree, with NO database:
//
//   1. CENSUS. Every table carrying a money shape (an amount, a payout / Connect account, a
//      stored price, a ticket), or a trust shape (standing, roles, permissions, moderation,
//      audit), or Vera's name, must carry a verdict line in scripts/rls-deny-surface.txt. A new
//      `amount_cents` column on a new table fails this gate until somebody decides what it is.
//      The census is derived from lib/database.types.ts -- the file generated FROM the database --
//      so a table that exists only in a migration nobody applied cannot sneak a verdict in, and a
//      table that exists and was never thought about cannot stay invisible.
//
//   2. THE MATRIX IS EXACT, BOTH WAYS. For every `money` / `trust` / `vera` line, the commands
//      listed as DENIED must be exactly the commands with no permissive policy, replayed from
//      supabase/migrations in statement order. A migration that gives space_vera_changes an
//      update policy -- turning the append-only Vera change log into an editable one -- fails here
//      in the same pull request, and so does a migration that silently REMOVES the last read
//      policy from a money table (that is a feature going dark, not a table going safe).
//
//   3. THE MATRIX IS PROVEN, NOT ONLY DECLARED. Each classed table must appear in the pgTAP
//      matrix guard (supabase/tests/money_trust_vera_policy_matrix.test.sql) with the SAME denied
//      list, so the claim this gate makes statically is re-made against a real Postgres by
//      `db-tests` on every migration PR. A table named here and absent there is a claim with no
//      database behind it.
//
// WHAT IT CANNOT SEE, said plainly, because this row is about money and an overstated gate is
// worse than none:
//
//   · WHETHER A DENY ACTUALLY DENIES. This reads SQL text. "No update policy" is a true statement
//     about the migrations; that Postgres therefore refuses a stranger's update is proven by
//     supabase/tests/money_trust_vera_deny.test.sql under `db-tests`, against a real database
//     with real rows, and by nothing in this file.
//   · WHETHER A POLICY PREDICATE IS SANE. A `for select using (true)` on a money table has a
//     SELECT policy and passes this gate. The behavioral test is what catches that.
//   · DYNAMIC DDL. Policies created through `execute format(...)` inside a DO block are invisible
//     to a text replay. One such loop exists (20260711100000, the restrictive space-writable
//     guards over circles/events/practices/journey_plans/programs) and it touches no classed
//     table; `events` is a `carrier` verdict partly for that reason. If a future loop reaches a
//     classed table, this gate's matrix will disagree with the pgTAP guard's reading of
//     pg_policies, and db-tests is where that shows up.
//   · COLUMN GRANTS. ADR-964 was a correctly-public table with an anon-readable
//     stripe_customer_id. That is check:grants' blind spot and it is this one's too.
//
// Usage: `node scripts/check-rls-deny.mjs` (or `pnpm check:rls-deny`). Exit 1 on a violation,
// exit 2 when the gate could not see enough to have an opinion.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MIGRATIONS = join('supabase', 'migrations')
const TYPES = join('lib', 'database.types.ts')
const SURFACE = join('scripts', 'rls-deny-surface.txt')
const MATRIX_TEST = join('supabase', 'tests', 'money_trust_vera_policy_matrix.test.sql')
const DENY_TEST = join('supabase', 'tests', 'money_trust_vera_deny.test.sql')

export const COMMANDS = ['select', 'insert', 'update', 'delete']
export const CLASSES = ['money', 'trust', 'vera', 'carrier']

/** Non-triviality floors. A gate that parsed nothing reports a clean bill of health, which is how
 *  check:rls came to carry MIN_LIVE_TABLES and check:grants the same. Same disease, same floor. */
export const MIN_MIGRATIONS = 400
export const MIN_LIVE_TABLES = 150
/** The census measured 42 classed tables on 2026-09-23. The floor sits well under it so an honest
 *  retirement never trips it, and a heuristic that stopped matching always does. */
export const MIN_CLASSED = 30

// ── The census heuristic ────────────────────────────────────────────────────────────────────────
//
// A column shape, not a column list: `amount_cents` today is `refund_cents` next quarter. Keep
// these patterns broad and let `carrier` carry the false positives -- a verdict a human wrote is
// the point of the file, and over-matching costs one line while under-matching costs the gate.

/** Money by COLUMN: an amount, a payout, a Connect / Stripe identifier, a stored price, a ticket. */
export const MONEY_COLUMN =
  /(_cents$|^amount$|_amount$|^amounts?_|payout|^stripe_|_stripe_[a-z_]*id$|^price$|_price_id$|^ticket_|_ticket_|ticket_id$|gem_cost|_cost_usd$)/

/** Money by NAME: the table is a record of a transaction even when its columns are coy. */
export const MONEY_TABLE =
  /(ticket|payout|stripe|invoice|payment|billing|donation|^tips$|_tips$|order|transaction|contribution|refund|price|subscription|entitlement|redemption)/

/** Trust by NAME: standing, roles, permissions, moderation, audit. */
export const TRUST_TABLE =
  /(trust|standing|permission|report|blocked|audit_log|^team_members$|moderation|suspend)/

/** Vera by NAME. Vera is a product name, so the name IS the shape. */
export const VERA_TABLE = /vera/

/** Classify one table. Returns the classes it is a CANDIDATE for; the verdict file decides which
 *  one it actually gets (a candidate may be ruled `carrier`). */
export function candidateClasses(table, columns) {
  const out = []
  if (MONEY_TABLE.test(table) || [...columns].some((c) => MONEY_COLUMN.test(c))) out.push('money')
  if (TRUST_TABLE.test(table)) out.push('trust')
  if (VERA_TABLE.test(table)) out.push('vera')
  return out
}

// ── Reading the generated types: the live table → column map ────────────────────────────────────

/**
 * PURE (testable): parse `Tables: { … }` out of a Supabase-generated types file into
 * Map<table, Set<column>>. The Row block is the one every table has; Insert/Update repeat it.
 */
export function parseTypes(src) {
  const start = src.indexOf('    Tables: {')
  const end = src.indexOf('    Views: {', start)
  if (start < 0 || end < 0) return new Map()
  const tables = new Map()
  let current = null
  for (const line of src.slice(start, end).split('\n')) {
    const table = /^ {6}([a-z0-9_]+): \{$/.exec(line)
    if (table) {
      current = table[1]
      if (!tables.has(current)) tables.set(current, new Set())
      continue
    }
    const column = /^ {10}([A-Za-z0-9_]+)\??: /.exec(line)
    if (column && current) tables.get(current).add(column[1])
  }
  return tables
}

// ── Reading the migrations: the final permissive-policy command set per table ───────────────────

const POLICY_NAME = '(?:"(?:[^"]|"")*"|[a-z0-9_]+)'
const strip = (raw) => raw.replace(/"/g, '').trim()
const bare = (raw) => strip(raw).replace(/^[a-z0-9_]+\./, '')
const NON_PUBLIC = /^(auth|storage|cron|extensions|vault|net|graphql|realtime|pgsodium|supabase_migrations|_analytics)\./

// One regex, one pass, so `matchAll` hands the alternatives back in STATEMENT ORDER -- the same
// reasoning (and the same shape) as scripts/check-rls.mjs, which documents why an order-blind set
// subtraction reads `drop table t; create table t;` as a dropped table.
const STATEMENT = new RegExp(
  [
    `(?<createTable>create table (?:if not exists )?(?<ctTable>[a-z0-9_."]+))`,
    `(?<dropTable>drop table (?:if exists )?(?<dtTable>[a-z0-9_."]+))`,
    `(?<enableRls>alter table (?:if exists )?(?:only )?(?<rlsTable>[a-z0-9_."]+) enable row level security)`,
    `(?<renameTable>alter table (?:if exists )?(?:only )?(?<rnFrom>[a-z0-9_."]+) rename to (?<rnTo>[a-z0-9_."]+))`,
    `(?<createPolicy>create policy (?:if not exists )?(?<cpName>${POLICY_NAME}) on (?<cpTable>[a-z0-9_."]+)(?<cpBody>[^;]*))`,
    `(?<dropPolicy>drop policy (?:if exists )?(?<dpName>${POLICY_NAME}) on (?<dpTable>[a-z0-9_."]+))`,
  ].join('|'),
  'g',
)

/**
 * PURE (testable): replay the migrations and report, per live public table, whether RLS is on and
 * which commands end with at least one PERMISSIVE policy.
 *
 * RESTRICTIVE policies are deliberately not counted. A restrictive policy can only ever narrow
 * what a permissive one allowed, so it cannot open a denied command -- counting it would let a
 * restrictive guard read as "this command is allowed" and quietly empty the deny list.
 */
export function scanPolicies(sqlChunks) {
  const tables = new Map()
  for (const chunk of Array.isArray(sqlChunks) ? sqlChunks : [sqlChunks]) {
    // Line comments first, then block comments non-greedily and per file -- the exact order
    // check-rls.mjs arrived at, for the exact reason its header records (a rollback script inside
    // a block comment read as a real DROP TABLE).
    const sql = chunk
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
    for (const { groups: g } of sql.matchAll(STATEMENT)) {
      if (g.createTable) {
        if (NON_PUBLIC.test(strip(g.ctTable))) continue
        const t = bare(g.ctTable)
        if (!tables.has(t)) tables.set(t, { rls: false, policies: new Map() })
      } else if (g.dropTable) {
        tables.delete(bare(g.dtTable))
      } else if (g.enableRls) {
        const entry = tables.get(bare(g.rlsTable))
        if (entry) entry.rls = true
      } else if (g.renameTable) {
        const from = bare(g.rnFrom)
        const entry = tables.get(from)
        if (entry) {
          tables.delete(from)
          tables.set(bare(g.rnTo), entry)
        }
      } else if (g.createPolicy) {
        if (NON_PUBLIC.test(strip(g.cpTable))) continue
        const entry = tables.get(bare(g.cpTable))
        if (!entry) continue
        const body = g.cpBody ?? ''
        const restrictive = /\bas restrictive\b/.test(body)
        const forCmd = /\bfor (all|select|insert|update|delete)\b/.exec(body)
        // No `for` clause means FOR ALL -- Postgres's default, and four commands, not zero.
        entry.policies.set(strip(g.cpName), { cmd: forCmd ? forCmd[1] : 'all', restrictive })
      } else if (g.dropPolicy) {
        if (NON_PUBLIC.test(strip(g.dpTable))) continue
        tables.get(bare(g.dpTable))?.policies.delete(strip(g.dpName))
      }
    }
  }
  const out = new Map()
  for (const [t, entry] of tables) {
    const allowed = new Set()
    for (const p of entry.policies.values()) {
      if (p.restrictive) continue
      if (p.cmd === 'all') for (const c of COMMANDS) allowed.add(c)
      else allowed.add(p.cmd)
    }
    out.set(t, { rls: entry.rls, allowed })
  }
  return out
}

// ── The verdict file ────────────────────────────────────────────────────────────────────────────

/** PURE (testable): parse scripts/rls-deny-surface.txt into Map<table, {klass, denied[]}>. */
export function parseSurface(text) {
  const rows = new Map()
  const errors = []
  for (const [i, raw] of text.split('\n').entries()) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const [table, klass, denied] = line.split(/\s+/)
    if (!table || !klass || !denied) {
      errors.push(`${SURFACE}:${i + 1}: expected "<table> <class> <denied>", got "${raw.trim()}"`)
      continue
    }
    if (!CLASSES.includes(klass)) {
      errors.push(`${SURFACE}:${i + 1}: class "${klass}" is not one of ${CLASSES.join(' / ')}`)
      continue
    }
    const cmds = denied === '-' ? [] : denied.split(',')
    const bad = cmds.filter((c) => !COMMANDS.includes(c))
    if (bad.length) {
      errors.push(`${SURFACE}:${i + 1}: "${bad.join(', ')}" is not a SQL command`)
      continue
    }
    if (rows.has(table)) {
      errors.push(`${SURFACE}:${i + 1}: ${table} already has a verdict`)
      continue
    }
    rows.set(table, { klass, denied: cmds })
  }
  return { rows, errors }
}

/** PURE (testable): pull the seeded pairs out of the pgTAP matrix guard's VALUES block.
 *
 *  Bounded to the block on purpose. A bare scan for `(\'x\', \'y\')` over the whole file also
 *  matched the sentence in the header that DESCRIBES the shape, and reported a table called
 *  "table" with no verdict -- a guard tripping over its own documentation. */
export function parseMatrixTest(sql) {
  const out = new Map()
  const block = /insert into _deny_matrix \(tbl, denied\) values([\s\S]*?);/.exec(sql)
  if (!block) return out
  for (const m of block[1].matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z,]*)'\s*\)/g)) {
    out.set(m[1], m[2] === '' ? [] : m[2].split(','))
  }
  return out
}

/** PURE (testable): every table the behavioral deny test names in its own declared roster. */
export function parseDenyTestRoster(sql) {
  const block = /-- ROSTER BEGIN([\s\S]*?)-- ROSTER END/.exec(sql)
  if (!block) return []
  return [...block[1].matchAll(/^--\s{3}([a-z0-9_]+)\s*$/gm)].map((m) => m[1])
}

// ── The comparison ──────────────────────────────────────────────────────────────────────────────

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const order = (cmds) => COMMANDS.filter((c) => cmds.includes(c))

/** PURE (testable): everything the CLI reports, computed from already-read text. */
export function audit({ types, policies, surface, matrixTest, denyRoster }) {
  const failures = []
  const live = parseTypes(types)
  const { rows, errors } = parseSurface(surface)
  for (const e of errors) failures.push(e)

  // 1. CENSUS -- a candidate with no verdict, and a verdict for a table that is not live.
  const candidates = []
  for (const [table, columns] of live) {
    if (candidateClasses(table, columns).length) candidates.push(table)
  }
  const missing = candidates.filter((t) => !rows.has(t)).sort()
  for (const t of missing) {
    const columns = [...live.get(t)].filter((c) => MONEY_COLUMN.test(c))
    failures.push(
      `${t} looks like a money / trust / Vera table${columns.length ? ` (${columns.join(', ')})` : ''} ` +
        `and has no verdict in ${SURFACE}.`,
    )
  }
  const stale = [...rows.keys()].filter((t) => !live.has(t)).sort()
  for (const t of stale) {
    failures.push(`${SURFACE} names ${t}, which is not a live table in ${TYPES}. Delete the line.`)
  }

  const classed = [...rows].filter(([, v]) => v.klass !== 'carrier').map(([t]) => t).sort()

  // 2. THE MATRIX IS EXACT -- denied must be the complement of what the migrations policy.
  for (const table of classed) {
    const { denied } = rows.get(table)
    const entry = policies.get(table)
    if (!entry) {
      failures.push(`${table} is classed in ${SURFACE} but no migration creates it. Which is it?`)
      continue
    }
    if (!entry.rls) {
      failures.push(`${table} is classed ${rows.get(table).klass} and no migration enables RLS on it.`)
    }
    const actual = order(COMMANDS.filter((c) => !entry.allowed.has(c)))
    const claimed = order(denied)
    if (!same(actual, claimed)) {
      const grew = actual.filter((c) => !claimed.includes(c))
      const shrank = claimed.filter((c) => !actual.includes(c))
      failures.push(
        `${table}: the deny matrix moved. ${SURFACE} says denied = ${claimed.join(',') || '(none)'}, ` +
          `the migrations end at ${actual.join(',') || '(none)'}.` +
          (shrank.length
            ? `\n    A policy now ALLOWS ${shrank.join(', ')} on a ${rows.get(table).klass} table. ` +
              `If that is the intent, change the line here AND the arm in ${MATRIX_TEST}, so the ` +
              `database is asked to agree.`
            : '') +
          (grew.length
            ? `\n    ${grew.join(', ')} lost its last policy. That is a read going dark, not a table ` +
              `going safe: every caller but service_role now sees nothing, silently.`
            : ''),
      )
    }
  }

  // 3. THE MATRIX IS PROVEN -- the pgTAP guard must carry the same rows.
  for (const table of classed) {
    const claimed = order(rows.get(table).denied)
    const inTest = matrixTest.get(table)
    if (!inTest) {
      failures.push(
        `${table} is classed ${rows.get(table).klass} in ${SURFACE} but ${MATRIX_TEST} never names it, ` +
          `so no database is ever asked to confirm its deny matrix.`,
      )
      continue
    }
    if (!same(order(inTest), claimed)) {
      failures.push(
        `${table}: ${MATRIX_TEST} asserts denied = ${order(inTest).join(',') || '(none)'} but ` +
          `${SURFACE} says ${claimed.join(',') || '(none)'}. One of them is wrong.`,
      )
    }
  }
  for (const table of matrixTest.keys()) {
    if (!rows.has(table)) {
      failures.push(`${MATRIX_TEST} asserts a deny matrix for ${table}, which has no verdict in ${SURFACE}.`)
    }
  }

  // 4. The behavioral roster must be a real subset of the census -- a seeded proof for a table
  //    nobody classed is a proof of nothing in particular.
  for (const table of denyRoster) {
    if (!rows.has(table) || rows.get(table).klass === 'carrier') {
      failures.push(`${DENY_TEST} seeds ${table}, which is not a classed money / trust / Vera table.`)
    }
  }

  return { failures, liveCount: live.size, candidates, classed, covered: denyRoster }
}

function main() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  if (files.length < MIN_MIGRATIONS) {
    console.error(
      `✗ check:rls-deny read only ${files.length} migration(s) from ${MIGRATIONS}, expected at ` +
        `least ${MIN_MIGRATIONS}. A gate that scans nothing passes everything.`,
    )
    process.exit(2)
  }
  const types = readFileSync(TYPES, 'utf8')
  const policies = scanPolicies(files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')))
  const result = audit({
    types,
    policies,
    surface: readFileSync(SURFACE, 'utf8'),
    matrixTest: parseMatrixTest(readFileSync(MATRIX_TEST, 'utf8')),
    denyRoster: parseDenyTestRoster(readFileSync(DENY_TEST, 'utf8')),
  })

  if (result.liveCount < MIN_LIVE_TABLES) {
    console.error(
      `✗ check:rls-deny resolved only ${result.liveCount} live table(s) from ${TYPES}, expected at ` +
        `least ${MIN_LIVE_TABLES}. The file was read but the parser matched almost nothing, so its ` +
        `silence about the money tables means nothing either.`,
    )
    process.exit(2)
  }
  if (result.classed.length < MIN_CLASSED) {
    console.error(
      `✗ check:rls-deny classed only ${result.classed.length} money / trust / Vera table(s), ` +
        `expected at least ${MIN_CLASSED}. Either the census heuristic stopped matching or the ` +
        `verdict file was emptied; both make this gate vacuous.`,
    )
    process.exit(2)
  }

  if (result.failures.length === 0) {
    console.log(
      `✓ RLS deny matrix: ${result.classed.length} money / trust / Vera table(s) carry an exact ` +
        `deny matrix that\n  matches the policies replayed from ${files.length} migrations, and every ` +
        `one is re-asserted against a\n  real database by ${MATRIX_TEST}.\n` +
        `  ${result.covered.length} of them are additionally proven row-by-row from an anon and a ` +
        `non-owner seat in\n  ${DENY_TEST}. This gate reads SQL text: that a deny DENIES is db-tests' ` +
        `word, not this one's.`,
    )
    return
  }

  console.error(`✗ check:rls-deny found ${result.failures.length} problem(s):\n`)
  for (const f of result.failures) console.error(`  - ${f}\n`)
  console.error(
    `Fix the table, or record the decision: ${SURFACE} carries one verdict per table and\n` +
      `${MATRIX_TEST} is where a database is asked to agree with it.\n`,
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

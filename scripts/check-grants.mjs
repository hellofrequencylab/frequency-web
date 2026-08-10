#!/usr/bin/env node
// TABLE-GRANT CONTRACT — every public table carries a deliberate access verdict.
//
// WHY THIS EXISTS. Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public` granting `anon`
// and `authenticated` on every new table. Those arrive as EXPLICIT per-role grants, so
// `REVOKE ... FROM public` does not touch them — the statement succeeds and removes nothing
// (ADR-959). The consequence measured on 2026-08-10: anon and authenticated each held 1,907
// explicit grants across 273 tables, and only SEVEN tables in the whole repo carried any
// explicit grant decision at all. The framing everyone had — "a revoke that removed nothing" —
// was wrong in an important way: all 19 `revoke ... from public` statements in this repo are on
// FUNCTIONS. No table was ever revoked from, in any form. Nothing was undone; nothing was ever
// done (ADR-964).
//
// 76 service-role-only tables were swept in `20270218000000`. This gate is what keeps the next
// table from arriving the same way.
//
// WHAT IT ENFORCES, both cumulative over every migration:
//
//   1. BIJECTION. The set of live `public` tables parsed from supabase/migrations/ equals the set
//      of names in scripts/table-grants.txt. A new table with no verdict fails. A verdict for a
//      dropped table fails.
//   2. `internal` IS LOAD-BEARING. A table marked `internal` must have an explicit
//      `revoke ... on <table> from ... anon ...` somewhere in the migrations. `public` and
//      `authenticated` are declarations only — see the blind spots below.
//
// WHY NOT A COUNT-RATCHET. A bare number's cheapest fix is to edit the number, which is exactly
// the failure ADR-962 recorded for check:adoption booking a phantom sweep. There is deliberately
// no baseline in this gate: adding a table is a one-word edit, and the word is the decision.
//
// WHY NOT "revoke in the same migration as the create". A grant decision legitimately lands
// later — signup_leads was created in 20270215000000 and revoked in 20270215000001. A per-file
// rule would have been red on 243 of 269 create sites on day one, and check-rls.mjs already
// documents why this class of check must be cumulative.
//
// WHAT IT CANNOT SEE, stated plainly so nobody mistakes green here for safe:
//   · Whether the revoke was ever APPLIED. This reads supabase/migrations/, not the database.
//     MCP apply_migration writes to prod without leaving a file, so the repo⇄ledger bijection
//     (ADR-963) is what makes "in a migration" approximate "in the database".
//   · COLUMN grants. `public` says nothing about which columns — that is the ADR-964 class,
//     where spaces.stripe_customer_id was anon-readable on a table that is correctly public.
//   · Views and materialized views. Default privileges hit them too; this parses tables only.
//   · Whether a policy predicate is sane. `public` and `authenticated` are unverified assertions.
//   · SECURITY DEFINER reach-around — an anon-EXECUTE function reading an `internal` table.
//     That is supabase/migrations/fail-open-guards.test.ts's job. Keep both.
//
// Usage: `node scripts/check-grants.mjs` (or `pnpm check:grants`). Exits 1 on violation.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = join('supabase', 'migrations')
const LEDGER = join('scripts', 'table-grants.txt')
const VERDICTS = new Set(['public', 'authenticated', 'internal'])

/** A repo this size never legitimately drops to a handful of migrations. */
const MIN_MIGRATIONS = 400

/**
 * Blank BOTH comment forms, preserving length so nothing shifts.
 *
 * The block form is not optional here and the first version of this file got it wrong.
 * `20260628010000_quest_completion_model.sql` carries a full DOWN/rollback script wrapped in a
 * C-style block comment (lines 242-349) containing a `DROP TABLE IF EXISTS
 * public.journey_completions;`. Reading only `--` comments, the parser saw that DROP as real and
 * removed the table from the live set — so `journey_completions` needed no verdict and would
 * have escaped this gate entirely. A table the parser cannot see is a table the gate cannot
 * protect, which is the whole failure class check:grants exists to close.
 *
 * BLANKED, not deleted, matching scripts/check-adoption.mjs: length-preserving substitution
 * cannot move a match that was already there.
 */
export function stripSqlComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\n)([ \t]*--[^\n]*)/g, (_m, lead, body) => lead + blank(body))
}

/** Live `public` tables, by replaying create / rename / drop in filename order.
 *  Order matters: a table can be created, renamed, and dropped across three migrations, and a
 *  set-union scan would report all three names as live. */
export function liveTables(files) {
  const live = new Set()
  for (const { text } of files) {
    const sql = stripSqlComments(text)

    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) {
      live.add(m[1].toLowerCase())
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+rename\s+to\s+"?([a-z0-9_]+)"?/gi)) {
      if (live.delete(m[1].toLowerCase())) live.add(m[2].toLowerCase())
    }
    for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) {
      live.delete(m[1].toLowerCase())
    }
    // A `create view` under a name a table once held retires the table from this set.
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?"?([a-z0-9_]+)"?/gi)) {
      live.delete(m[1].toLowerCase())
    }
  }
  return live
}

/** Tables with an explicit `revoke ... from ... anon ...` anywhere in the migrations. */
export function revokedTables(files) {
  const revoked = new Set()
  for (const { text } of files) {
    const sql = text
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
    for (const m of sql.matchAll(
      /revoke\s+[^;]*?\son\s+(?:table\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+from\s+([^;]+);/gi,
    )) {
      if (/\banon\b/i.test(m[2])) revoked.add(m[1].toLowerCase())
    }
  }
  return revoked
}

/** Parse the ledger: `name<whitespace>verdict`, `#` comments, blank lines ignored. */
export function parseLedger(text) {
  const out = new Map()
  const bad = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) return
    const [name, verdict] = line.split(/\s+/)
    if (!name || !verdict || !VERDICTS.has(verdict)) {
      bad.push(`${LEDGER}:${i + 1}  "${raw.trim()}"`)
      return
    }
    out.set(name.toLowerCase(), { verdict, line: i + 1 })
  })
  return { entries: out, bad }
}

function main() {
  if (!existsSync(MIGRATIONS) || !existsSync(LEDGER)) {
    console.error(`✗ check:grants — missing ${!existsSync(MIGRATIONS) ? MIGRATIONS : LEDGER} (cwd: ${process.cwd()}).`)
    console.error('    Run from the repo root. A gate cannot pass over nothing.')
    process.exit(1)
  }

  const names = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  if (names.length < MIN_MIGRATIONS) {
    console.error(`✗ check:grants — found ${names.length} migration(s), expected at least ${MIN_MIGRATIONS}.`)
    process.exit(1)
  }
  const files = names.map((f) => ({ name: f, text: readFileSync(join(MIGRATIONS, f), 'utf8') }))

  const live = liveTables(files)
  const revoked = revokedTables(files)
  const { entries, bad } = parseLedger(readFileSync(LEDGER, 'utf8'))

  let failures = 0

  for (const line of bad) {
    failures++
    console.error(`✗ check:grants — unparseable ledger line.\n\n  ${line}\n`)
    console.error(`    Expected: <table_name>  <public|authenticated|internal>\n`)
  }

  // 1. Bijection — missing verdicts.
  for (const table of [...live].sort()) {
    if (entries.has(table)) continue
    failures++
    const created = files.find((f) =>
      new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?"?${table}"?`, 'i').test(f.text),
    )
    console.error(`✗ check:grants — no grant verdict for \`${table}\`.`)
    console.error(`    created in ${MIGRATIONS}/${created?.name ?? '(unknown)'}\n`)
    console.error(`    Supabase ships \`ALTER DEFAULT PRIVILEGES IN SCHEMA public\`, so anon and`)
    console.error(`    authenticated ALREADY hold table grants on this table. \`REVOKE ... FROM public\``)
    console.error(`    does not remove them (ADR-959). Decide, then add ONE line to ${LEDGER}:\n`)
    console.error(`      ${table}  internal        <- service_role only. ALSO add to the migration:`)
    console.error(`                                   revoke all on table public.${table}`)
    console.error(`                                     from anon, authenticated;`)
    console.error(`      ${table}  authenticated   <- signed-in callers query it with the anon key`)
    console.error(`      ${table}  public          <- a signed-out visitor must read it\n`)
    console.error(`    If you are unsure, it is \`internal\`. That is the only verdict that fails closed.\n`)
  }

  // 2. Bijection — stale verdicts.
  for (const [table, { line }] of [...entries].sort()) {
    if (live.has(table)) continue
    failures++
    console.error(`✗ check:grants — stale ledger entry \`${table}\` (${LEDGER}:${line}).`)
    console.error(`    No live public table by that name in ${MIGRATIONS}/. Delete the line.\n`)
  }

  // 3. `internal` must be backed by a real revoke.
  for (const [table, { verdict, line }] of [...entries].sort()) {
    if (verdict !== 'internal' || !live.has(table) || revoked.has(table)) continue
    failures++
    console.error(`✗ check:grants — \`${table}\` is marked \`internal\` but never revoked (${LEDGER}:${line}).`)
    console.error(`    \`internal\` means service_role only, and RLS-on-with-no-policy is the SECOND`)
    console.error(`    lock, not the first. anon and authenticated hold explicit per-role grants on`)
    console.error(`    this table right now. Add to a migration:\n`)
    console.error(`      revoke all on table public.${table} from anon, authenticated;\n`)
    console.error(`    Template: ${MIGRATIONS}/20270218000000_close_default_grants_on_internal_tables.sql\n`)
  }

  if (failures > 0) {
    console.error(`✗ Table-grant contract: ${failures} problem(s).`)
    process.exit(1)
  }

  const counts = { public: 0, authenticated: 0, internal: 0 }
  for (const [, { verdict }] of entries) counts[verdict]++
  console.log(
    `✓ Table-grant contract: ${live.size} live public table(s), every one with a verdict ` +
      `(${counts.public} public · ${counts.authenticated} authenticated · ${counts.internal} internal, ` +
      `all revoked).`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('check-grants.mjs')) main()

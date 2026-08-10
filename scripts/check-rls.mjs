#!/usr/bin/env node
// check:rls — shift-left of the Supabase rls_* advisors. Static-analyzes supabase/migrations
// and asserts that every public table CREATED in a migration is also given Row Level Security
// AND either at least one policy OR an explicit, reasoned deny-all entry (scripts/rls-deny-all.txt).
// Catches the classic mistake — a new table shipped with RLS off (readable by anon via the anon
// key) — at PR time, before merge, with no DB access. The runtime truth stays the DB advisors +
// the pgTAP suite (db-tests); this is the cheap always-on floor in front of them.
//
// Method: concatenate every migration in order, then track created / dropped / rls-enabled /
// policied tables across the whole history (RLS may be enabled in a later migration than the
// CREATE, so a cumulative scan is required — a per-file rule would false-positive on that).
//
// Usage: `node scripts/check-rls.mjs` (or `pnpm check:rls`). Exit 1 on any live public table
// missing RLS, or with RLS-but-no-policy and not on the deny-all allowlist.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = 'supabase/migrations'

// Schemas that are NOT public — a `create table <schema>.x` there is out of scope (extensions,
// Supabase-managed, or internal), so skip it.
const NON_PUBLIC = /^(auth|storage|cron|extensions|vault|net|graphql|realtime|pgsodium|supabase_migrations|_analytics)\./

const strip = (raw) => raw.replace(/"/g, '').trim()
const bare = (raw) => strip(raw).replace(/^[a-z0-9_]+\./, '')

/**
 * PURE scanner (testable): given the full migration SQL and the deny-all set, return the tables
 * missing RLS and the tables with RLS-but-no-policy that aren't on the allowlist.
 */
export function scanRls(rawSql, denyAll = new Set()) {
  // Strip `--` line comments BEFORE collapsing whitespace (a `-- create table if …` comment
  // would otherwise be scanned as real DDL), then collapse whitespace so multi-line CREATE
  // POLICY / ALTER TABLE statements match on one line. Block comments (`/* */`) are deliberately
  // NOT stripped — a naive greedy strip silently eats real DDL when a stray `/*` sits in a string
  // literal, and this repo's block comments are verified DDL-free, so leaving them is safe.
  const sql = rawSql.replace(/--[^\n]*/g, ' ').toLowerCase().replace(/\s+/g, ' ')

  const created = new Set()
  const dropped = new Set()
  const rls = new Set()
  const policied = new Set()

  for (const m of sql.matchAll(/create table (?:if not exists )?([a-z0-9_."]+)/g)) {
    if (NON_PUBLIC.test(strip(m[1]))) continue
    created.add(bare(m[1]))
  }
  for (const m of sql.matchAll(/drop table (?:if exists )?([a-z0-9_."]+)/g)) dropped.add(bare(m[1]))
  for (const m of sql.matchAll(/alter table (?:if exists )?(?:only )?([a-z0-9_."]+) enable row level security/g)) rls.add(bare(m[1]))
  for (const m of sql.matchAll(/create policy .+? on ([a-z0-9_."]+)/g)) policied.add(bare(m[1]))

  const live = [...created].filter((t) => !dropped.has(t))
  const liveSet = new Set(live)
  return {
    liveCount: live.length,
    missingRls: live.filter((t) => !rls.has(t)).sort(),
    noPolicy: live.filter((t) => rls.has(t) && !policied.has(t) && !denyAll.has(t)).sort(),
    // An allowlist entry naming a table that no longer exists. The allowlist is only ever
    // SUBTRACTED above, so a stale line is invisible: it exempts nothing and reports nothing,
    // and the file slowly stops describing the database it is supposed to account for. Every
    // other frozen list in this repo guards its own rot in so many words — `KNOWN_DELEGATED`
    // in check-headers, `FROZEN_MENU_DEBT` in check-menu, `FROZEN_GATE_DEBT` in
    // check-gate-parity — and this one did not. Found with one dead entry
    // (`program_adoptions`, dropped by 20261114000000); the mechanism is unbounded.
    staleDenyAll: [...denyAll].filter((t) => !liveSet.has(t)).sort(),
  }
}

/** A gate that scans nothing reports a clean bill of health. `check:grants` reads THIS SAME
 *  directory and floors it at 400; the floor was written once and not applied to its neighbour.
 *  If the `create table` regex stops matching (a DDL style change, a different spelling), `live`
 *  goes empty and the success line reads "all 0 live public table(s)" — which is how a table
 *  ships anon-readable with a green check beside it. */
export const MIN_MIGRATIONS = 400
export const MIN_LIVE_TABLES = 150

/** Load the reviewed deny-all allowlist (RLS-on-no-policy = fail-closed, service-role-only). */
export function loadDenyAll() {
  return new Set(
    readFileSync(join('scripts', 'rls-deny-all.txt'), 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean),
  )
}

function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  if (files.length < MIN_MIGRATIONS) {
    console.error(
      `✗ check:rls read only ${files.length} migration(s) from ${DIR}, expected at least ` +
        `${MIN_MIGRATIONS}. The directory moved or the read is broken. A gate that scans nothing ` +
        'passes everything, so this is a failure rather than a clean run.',
    )
    process.exit(1)
  }
  const rawSql = files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n')
  const { liveCount, missingRls, noPolicy, staleDenyAll } = scanRls(rawSql, loadDenyAll())

  if (liveCount < MIN_LIVE_TABLES) {
    console.error(
      `✗ check:rls resolved only ${liveCount} live public table(s), expected at least ` +
        `${MIN_LIVE_TABLES}. The migrations were read but the DDL scanner matched almost nothing, ` +
        'so its silence about RLS means nothing either.',
    )
    process.exit(1)
  }

  if (staleDenyAll.length > 0) {
    console.error(
      `✗ scripts/rls-deny-all.txt names ${staleDenyAll.length} table(s) that no longer exist:\n`,
    )
    for (const t of staleDenyAll) console.error(`    - ${t}`)
    console.error(
      '\n  Delete the line. An allowlist is only ever subtracted from the live set, so a stale\n' +
        '  entry exempts nothing and warns nobody, and the file quietly stops describing the\n' +
        '  database. Removing it is the whole fix.\n',
    )
    process.exit(1)
  }

  if (missingRls.length + noPolicy.length === 0) {
    console.log(
      `✓ RLS guard: all ${liveCount} live public table(s) created in migrations have RLS enabled\n` +
        `  and a policy (or a reasoned deny-all). Shift-left of the Supabase rls_* advisors.`,
    )
    return
  }

  console.error('✗ RLS guard found tables that could be exposed:\n')
  if (missingRls.length) {
    console.error(`  RLS NOT ENABLED (readable by anon via the anon key) — ${missingRls.length}:`)
    for (const t of missingRls) console.error(`    - ${t}  → add: alter table ${t} enable row level security;`)
    console.error('')
  }
  if (noPolicy.length) {
    console.error(`  RLS ON but no policy and not on the deny-all allowlist — ${noPolicy.length}:`)
    for (const t of noPolicy) console.error(`    - ${t}  → add a policy, OR add "${t}" to scripts/rls-deny-all.txt if service-role-only`)
    console.error('')
  }
  console.error('Fix the table, or (for a deliberate service-role-only table) add it to scripts/rls-deny-all.txt.')
  process.exit(1)
}

// Run as a CLI only when executed directly (so the test can import the pure scanner).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

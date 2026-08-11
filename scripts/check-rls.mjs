#!/usr/bin/env node
// check:rls — shift-left of the Supabase rls_* advisors. Static-analyzes supabase/migrations
// and asserts that every public table CREATED in a migration is also given Row Level Security
// AND either at least one policy OR an explicit, reasoned deny-all entry (scripts/rls-deny-all.txt).
// Catches the classic mistake — a new table shipped with RLS off (readable by anon via the anon
// key) — at PR time, before merge, with no DB access. The runtime truth stays the DB advisors +
// the pgTAP suite (db-tests); this is the cheap always-on floor in front of them.
//
// Method: REPLAY every migration in filename order, and every statement within a file in the
// order it appears, against a running model of the schema (RLS may be enabled in a later
// migration than the CREATE, so a cumulative scan is required — a per-file rule would
// false-positive on that).
//
// The replay is order-aware and policies are tracked BY NAME, because both matter:
//
//   • Order. The scan used to be set subtraction over the whole concatenated history — every
//     `create table` into one set, every `drop table` into another. That reads `drop table t;
//     create table t;` as "dropped" and drops the table out of the checked set entirely, so a
//     re-created table is never checked for RLS again. `commerce_variants` was exactly this:
//     created 20260815000000, dropped 20260928000000, re-created 20261132000000, and therefore
//     invisible to this gate for the whole time it has been live.
//
//   • Names. `create policy` used to set a boolean and `drop policy` was never read at all, so
//     a table that lost its LAST policy still scored as policied forever — the precise
//     regression this gate exists to catch, since a table with RLS on and zero policies is one
//     nobody can read (and, if RLS were also dropped, one anybody can). A boolean is not enough
//     to fix it either: `drop policy "x" on t; create policy "x" on t;` is the ordinary way to
//     edit a policy in place and must end at ONE, not zero, so membership is tracked per name.
//
// Usage: `node scripts/check-rls.mjs` (or `pnpm check:rls`). Exit 1 on any live public table
// missing RLS, or ending at zero policies without being on the deny-all allowlist.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = 'supabase/migrations'

// Schemas that are NOT public — a `create table <schema>.x` there is out of scope (extensions,
// Supabase-managed, or internal), so skip it.
const NON_PUBLIC = /^(auth|storage|cron|extensions|vault|net|graphql|realtime|pgsodium|supabase_migrations|_analytics)\./

const strip = (raw) => raw.replace(/"/g, '').trim()
const bare = (raw) => strip(raw).replace(/^[a-z0-9_]+\./, '')

// A policy name: either a quoted identifier (`"Anyone can read active invite links"` — spaces are
// legal and common, and `""` is the escape for a literal quote) or a bare one (`invite_links_read`).
const POLICY_NAME = '(?:"(?:[^"]|"")*"|[a-z0-9_]+)'

// One regex, one pass, so the alternatives come back in the order they appear in the file —
// `matchAll` yields matches left to right, which IS statement order. Scanning each statement kind
// in its own separate pass is what made the old scan order-blind.
const STATEMENT = new RegExp(
  [
    `(?<createTable>create table (?:if not exists )?(?<ctTable>[a-z0-9_."]+))`,
    `(?<dropTable>drop table (?:if exists )?(?<dtTable>[a-z0-9_."]+))`,
    `(?<enableRls>alter table (?:if exists )?(?:only )?(?<rlsTable>[a-z0-9_."]+) enable row level security)`,
    // A rename carries the table's RLS state and every one of its policies to the new name.
    // Modelling it is part of being order-aware: without it the replay keeps scoring the OLD name
    // (a table that no longer exists) and never sees the policies written under the new one.
    `(?<renameTable>alter table (?:if exists )?(?:only )?(?<rnFrom>[a-z0-9_."]+) rename to (?<rnTo>[a-z0-9_."]+))`,
    `(?<createPolicy>create policy (?:if not exists )?(?<cpName>${POLICY_NAME}) on (?<cpTable>[a-z0-9_."]+))`,
    `(?<dropPolicy>drop policy (?:if exists )?(?<dpName>${POLICY_NAME}) on (?<dpTable>[a-z0-9_."]+))`,
    // `alter policy` retargets or renames an EXISTING policy. It never changes how many policies a
    // table has, so it is matched only to be explicitly and visibly a no-op on membership.
    `(?<alterPolicy>alter policy (?<apName>${POLICY_NAME}) on (?<apTable>[a-z0-9_."]+))`,
  ].join('|'),
  'g',
)

/**
 * PURE scanner (testable): replay the migrations and report what the schema ENDS at.
 *
 * `sqlChunks` is either one SQL string (convenient for tests) or an array of file contents in
 * filename order (what the CLI passes). Keeping the files separate stops a statement at the end of
 * one file from pairing with text at the start of the next after whitespace collapsing.
 *
 * Returns the tables missing RLS, the tables that end at zero policies (split into "never had one"
 * and "had one and lost it", which are different mistakes with different fixes), and stale
 * allowlist entries.
 */
export function scanRls(sqlChunks, denyAll = new Set()) {
  // Live model: bare table name → { rls, policies: Set<name>, everPolicied }.
  // `drop table` DELETES the entry, so a later `create table` starts clean — a re-created table
  // must re-enable RLS and re-declare its policies to pass, which is exactly what Postgres requires.
  const tables = new Map()

  for (const chunk of Array.isArray(sqlChunks) ? sqlChunks : [sqlChunks]) {
    // Strip comments BEFORE collapsing whitespace (a `-- create table if …` comment would
    // otherwise be scanned as real DDL), then collapse whitespace so multi-line CREATE POLICY /
    // ALTER TABLE statements match on one line.
    //
    // Line comments go first so a `/*` sitting inside one can never pair with a later `*/`. Block
    // comments are then stripped NON-GREEDILY and PER FILE, which is what makes it safe here: ten
    // migrations carry an unmatched lone `/*` or `*/` (inside a string literal or a regex), and a
    // lazy per-file match simply never pairs those, whereas a greedy or whole-corpus match would
    // swallow every statement between one file's stray `/*` and another file's real `*/`.
    //
    // This used to skip block comments entirely, on the reasoning that the corpus was verified
    // DDL-free inside them. It is not: 20260628010000_quest_completion_model.sql keeps its whole
    // ROLLBACK script in a block comment, including `DROP TABLE IF EXISTS public.journey_completions`,
    // which the scan read as a real drop — so journey_completions was silently absent from the live
    // set and went unchecked. Verified against production: stripping adds exactly that one table
    // and removes none, and changes no table's RLS flag or policy count. `check-grants.mjs` has
    // stripped block comments the same way all along.
    const sql = chunk
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')

    for (const { groups: g } of sql.matchAll(STATEMENT)) {
      if (g.createTable) {
        if (NON_PUBLIC.test(strip(g.ctTable))) continue
        const t = bare(g.ctTable)
        // `if not exists` re-running over a live table must not wipe its policies.
        if (!tables.has(t)) tables.set(t, { rls: false, policies: new Set(), everPolicied: false })
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
          // `rename to` takes a bare name (no schema qualifier is legal there), but bare() is
          // harmless and keeps the two sides normalised the same way.
          tables.set(bare(g.rnTo), entry)
        }
      } else if (g.createPolicy) {
        if (NON_PUBLIC.test(strip(g.cpTable))) continue
        const entry = tables.get(bare(g.cpTable))
        if (!entry) continue // a policy on a table this scan never saw created — nothing to score
        entry.policies.add(strip(g.cpName))
        entry.everPolicied = true
      } else if (g.dropPolicy) {
        if (NON_PUBLIC.test(strip(g.dpTable))) continue
        // Set.delete on an absent name is a no-op, so `drop policy if exists` naming a policy that
        // was never created cannot drive the count below zero.
        tables.get(bare(g.dpTable))?.policies.delete(strip(g.dpName))
      }
      // g.alterPolicy: deliberately no membership change.
    }
  }

  const live = [...tables.keys()]
  const liveSet = new Set(live)
  const zeroPolicy = live.filter(
    (t) => tables.get(t).rls && tables.get(t).policies.size === 0 && !denyAll.has(t),
  )
  return {
    liveCount: live.length,
    missingRls: live.filter((t) => !tables.get(t).rls).sort(),
    noPolicy: zeroPolicy.filter((t) => !tables.get(t).everPolicied).sort(),
    // The regression this gate exists to catch, and the one it structurally could not see while
    // `drop policy` went unread: the table HAD policies and now has none. RLS is still on, so it
    // is fail-closed rather than exposed — every read through the anon or authenticated key
    // returns zero rows, silently, and the feature that used the table just goes empty. It is
    // reported apart from `noPolicy` because the fix differs: a never-policied table needs a
    // policy written, whereas this one needs the dropped policy REPLACED (or the table moved onto
    // the deny-all allowlist, if going service-role-only was the point).
    lastPolicyDropped: zeroPolicy.filter((t) => tables.get(t).everPolicied).sort(),
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
  // Kept as an array, in filename order: the replay depends on statement order, and separate
  // chunks also stop the tail of one migration from pairing with the head of the next.
  const sqlChunks = files.map((f) => readFileSync(join(DIR, f), 'utf8'))
  const { liveCount, missingRls, noPolicy, lastPolicyDropped, staleDenyAll } = scanRls(
    sqlChunks,
    loadDenyAll(),
  )

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

  if (missingRls.length + noPolicy.length + lastPolicyDropped.length === 0) {
    console.log(
      `✓ RLS guard: all ${liveCount} live public table(s) created in migrations have RLS enabled\n` +
        `  and at least one policy still standing (or a reasoned deny-all). Replayed create/drop\n` +
        `  policy in statement order. Shift-left of the Supabase rls_* advisors.`,
    )
    return
  }

  console.error('✗ RLS guard found tables that could be exposed:\n')
  if (missingRls.length) {
    console.error(`  RLS NOT ENABLED (readable by anon via the anon key) — ${missingRls.length}:`)
    for (const t of missingRls) console.error(`    - ${t}  → add: alter table ${t} enable row level security;`)
    console.error('')
  }
  if (lastPolicyDropped.length) {
    console.error(`  LAST POLICY DROPPED (RLS on, zero policies left) — ${lastPolicyDropped.length}:`)
    for (const t of lastPolicyDropped) {
      console.error(`    - ${t}  → re-add a policy, OR add "${t}" to scripts/rls-deny-all.txt if going service-role-only was the intent`)
    }
    console.error(
      '\n    These tables HAD a policy and a migration dropped the last one. With RLS still on and\n' +
        '    no policy, Postgres denies every row to anon and authenticated: the table is fail-closed,\n' +
        '    not exposed, so nothing leaks — but every read through the anon key silently returns zero\n' +
        '    rows and whatever feature used the table just goes empty, with no error to trace. If the\n' +
        '    same migration had also dropped RLS, the failure would invert into a full public read.\n' +
        '    Either outcome is a regression that ships quietly, which is why it is gated here.\n',
    )
  }
  if (noPolicy.length) {
    console.error(`  RLS ON but never given a policy, and not on the deny-all allowlist — ${noPolicy.length}:`)
    for (const t of noPolicy) console.error(`    - ${t}  → add a policy, OR add "${t}" to scripts/rls-deny-all.txt if service-role-only`)
    console.error('')
  }
  console.error('Fix the table, or (for a deliberate service-role-only table) add it to scripts/rls-deny-all.txt.')
  process.exit(1)
}

// Run as a CLI only when executed directly (so the test can import the pure scanner).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

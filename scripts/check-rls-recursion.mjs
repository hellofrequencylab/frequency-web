#!/usr/bin/env node
// RECURSIVE RLS POLICY DETECTOR.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// On 2026-09-21 the owner reported "The Plan could not be saved." Cause: space_plans and
// space_plan_shares each had a SELECT policy whose body queried the other table, so evaluating
// either applied the other's policy, which applied the first again. Postgres refuses the whole
// statement at REWRITE time with SQLSTATE 42P17, "infinite recursion detected in policy for
// relation …". It fires regardless of data — both tables were empty and it still fired.
//
// The feature was 100% dead from the day it shipped and stayed dead for five days across EIGHT
// backlog rows marked done, because:
//   * every probe for those rows was a readFileSync().includes() grep over the .sql file, which
//     a migration no database can execute passes perfectly;
//   * scripts/check-rls.mjs asserts "RLS is on and has ≥1 policy", which was true;
//   * the app swallowed the Postgres error at every call site.
//
// A gate that reads SQL as text cannot notice a cycle. This one builds the reference graph and
// looks for one. AGENTS.md: "Every fail-safe needs a gate that notices it fired."
//
// ── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────
// For the FINAL definition of every policy (a later `create policy` with the same name on the
// same table replaces an earlier one, exactly as Postgres does), find which other RLS-enabled
// tables its body references directly. Then report any cycle in that graph.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────
// It does not resolve SECURITY DEFINER functions. That is the whole point: a definer function
// reads with RLS BYPASSED, so it is exactly how you legitimately break a cycle, and treating a
// call to one as an edge would flag the fix as the bug. Policies that route a cross-table lookup
// through private.* are therefore invisible here, which is correct.
//
// Being regex-based over SQL text, it can miss an exotic construction. It is a smoke alarm for a
// specific, known, expensive failure, not a proof of absence.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'
const OFF = '\x1b[0m'

/** `create policy <name> on <table> ... ;` — body is everything up to the statement's semicolon. */
const POLICY_RE =
  /create\s+policy\s+"?([a-z0-9_]+)"?\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?([\s\S]*?);/gi
const DROP_RE =
  /drop\s+policy\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?/gi

/** Strip comments and string literals so neither can contribute a spurious table reference. */
function scrub(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

function main() {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  // policy key -> { table, body, file }. Later definitions overwrite earlier ones, and a DROP
  // removes it, so what we analyse is the state the database actually ends up in.
  const policies = new Map()

  for (const file of files) {
    const sql = scrub(readFileSync(join(DIR, file), 'utf8'))

    for (const m of sql.matchAll(DROP_RE)) {
      policies.delete(`${m[2]}.${m[1]}`)
    }
    for (const m of sql.matchAll(POLICY_RE)) {
      const [, name, table, body] = m
      policies.set(`${table}.${name}`, { table, body, file, name })
    }
  }

  const tables = new Set([...policies.values()].map((p) => p.table))

  // table -> Set of other policied tables its policy bodies reference.
  const edges = new Map()
  const why = new Map()

  for (const p of policies.values()) {
    for (const other of tables) {
      if (other === p.table) continue
      // A bare or public-qualified reference to the other table, on a word boundary.
      const ref = new RegExp(`(?:^|[^a-z0-9_.])(?:public\\.)?${other}(?:[^a-z0-9_]|$)`, 'i')
      if (!ref.test(p.body)) continue
      if (!edges.has(p.table)) edges.set(p.table, new Set())
      edges.get(p.table).add(other)
      const k = `${p.table}->${other}`
      if (!why.has(k)) why.set(k, `${p.name} (${p.file})`)
    }
  }

  // Depth-first cycle search over the reference graph.
  const cycles = []
  const seen = new Set()

  function walk(node, path, onPath) {
    for (const next of edges.get(node) ?? []) {
      if (onPath.has(next)) {
        const cycle = [...path.slice(path.indexOf(next)), next]
        // Dedup on the SET of tables, not the path: the same two-table cycle is discovered once
        // from each end, and the two paths differ only in which table is repeated.
        const key = [...new Set(cycle)].sort().join(',')
        if (!seen.has(key)) {
          seen.add(key)
          cycles.push(cycle)
        }
        continue
      }
      if (path.includes(next)) continue
      onPath.add(next)
      walk(next, [...path, next], onPath)
      onPath.delete(next)
    }
  }

  for (const t of tables) walk(t, [t], new Set([t]))

  if (cycles.length === 0) {
    console.log(
      `${GREEN}✓ rls recursion: ${policies.size} live policies across ${tables.size} tables, no cycles.${OFF}`,
    )
    console.log(
      `${DIM}  A policy body that queries another policied table is an edge. Cross-table lookups routed${OFF}`,
    )
    console.log(
      `${DIM}  through a SECURITY DEFINER function are not edges, because that is how you break a cycle.${OFF}`,
    )
    return
  }

  console.error(`${RED}✗ rls recursion: ${cycles.length} policy cycle(s).${OFF}`)
  console.error(
    '\n  Postgres aborts EVERY statement on these tables with SQLSTATE 42P17, whatever they contain.',
  )
  console.error('  This is not a style note. The affected tables are unusable.\n')
  for (const cycle of cycles) {
    console.error(`  ${RED}${cycle.join(' → ')}${OFF}`)
    for (let i = 0; i < cycle.length - 1; i++) {
      console.error(`      ${DIM}${cycle[i]} → ${cycle[i + 1]} via ${why.get(`${cycle[i]}->${cycle[i + 1]}`)}${OFF}`)
    }
  }
  console.error(
    '\n  FIX: hoist the cross-table lookup into a SECURITY DEFINER function in `private`, which',
  )
  console.error(
    '  reads with RLS bypassed, and call that from the policy. See 20270345007300 for the shape.',
  )
  console.error(
    '  Prefer a function that returns a BOOLEAN about the caller\'s own permission over one that',
  )
  console.error('  returns an id, so it leaks nothing and a missing row is a refusal.\n')
  process.exit(1)
}

main()

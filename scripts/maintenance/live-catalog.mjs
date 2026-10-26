#!/usr/bin/env node
// live-catalog: the production CATALOG, read against rules the repo's migration-text gates cannot
// see (SCAN-1123 follow-up, SEC-002).
//
// WHY THIS EXISTS. check:rls and check:grants replay supabase/migrations. A table created out of
// band (an operator's `create table zz_backup_... as select ...`, an extension's own table) is in
// no migration, so every text gate passes while the live table is readable and truncatable by the
// browser roles. SEC-002 was exactly that: two backups with anon/authenticated grants and, for one,
// RLS off. This reads pg_catalog on the live database and fails on the same shapes.
//
// Rules, per public ordinary table:
//   1. RLS is on, unless the table is on ACCEPTED_NO_RLS (an extension-owned table we cannot alter).
//   2. A backup-shaped table (zz_backup_*, *_backup_*, *_bak, *_old_*) grants NOTHING to anon or
//      authenticated, at table level or column level.
//
// Shape matches ledger-parity.mjs: the workflow fetches with a token and feeds this script the JSON,
// so the script is a pure function of its input and testable without a database.
//
// Usage:
//   node scripts/maintenance/live-catalog.mjs --print-query
//   node scripts/maintenance/live-catalog.mjs <catalog.json>      # exit 1 on any finding

import { readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

/** Extension-owned tables the project role cannot enable RLS on. PostGIS reference data, public by design. */
export const ACCEPTED_NO_RLS = new Set(['spatial_ref_sys'])

/** A name that says "someone copied data here by hand". */
export const BACKUP_SHAPE = /^zz_|(^|_)(backup|bak)(_|$)|_old_/

/** A catalog read below this is a broken read, not a clean database (the repo has hundreds). */
export const MIN_TABLES = 200

export const CATALOG_QUERY = `
select c.relname as name,
       c.relrowsecurity as rls,
       exists (select 1 from information_schema.role_table_grants g
                where g.table_schema = 'public' and g.table_name = c.relname
                  and g.grantee in ('anon', 'authenticated')
                  and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) as browser_table_grant,
       exists (select 1 from information_schema.role_column_grants g
                where g.table_schema = 'public' and g.table_name = c.relname
                  and g.grantee in ('anon', 'authenticated')) as browser_column_grant
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
 order by c.relname`.trim()

/** Rows out of however the Management API spells the payload; an error THROWS (never an empty corpus). */
export function parseCatalog(payload) {
  const ok = (v) => Array.isArray(v) && v.every((r) => r && typeof r === 'object' && 'name' in r)
  if (ok(payload)) return payload
  if (payload && typeof payload === 'object') {
    if (payload.error || payload.message) throw new Error(`catalog query failed: ${JSON.stringify(payload.error ?? payload.message)}`)
    for (const v of Object.values(payload)) if (ok(v)) return v
  }
  throw new Error('catalog payload contained no rows with a `name` column; expected the Management API response for CATALOG_QUERY.')
}

/** @returns {{ table: string, rule: string, detail: string }[]} */
export function findings(rows, { min = MIN_TABLES } = {}) {
  if (rows.length < min) {
    throw new Error(`live-catalog read ${rows.length} public table(s), expected at least ${min}: a broken read, not a clean run.`)
  }
  const out = []
  for (const r of rows) {
    if (!r.rls && !ACCEPTED_NO_RLS.has(r.name)) {
      out.push({ table: r.name, rule: 'rls-off', detail: 'Row Level Security is off on a public table.' })
    }
    if (BACKUP_SHAPE.test(r.name) && (r.browser_table_grant || r.browser_column_grant)) {
      out.push({ table: r.name, rule: 'backup-grants', detail: 'A backup-shaped table still grants to anon or authenticated. Re-run the revoke pattern in scripts/ops/secure-frequency-backups.sql.' })
    }
  }
  return out
}

export function formatReport(found, total) {
  if (!found.length) return `Live catalog: ${total} public tables, no findings.`
  return [`Live catalog: ${found.length} finding(s) across ${total} public tables.`, ...found.map((f) => `- ${f.table} [${f.rule}]: ${f.detail}`)].join('\n')
}

if (invokedDirectly(import.meta.url)) {
  const arg = process.argv[2]
  if (arg === '--print-query') {
    console.log(CATALOG_QUERY)
  } else if (!arg) {
    console.error('usage: live-catalog.mjs --print-query | <catalog.json>')
    process.exit(2)
  } else {
    const rows = parseCatalog(JSON.parse(readFileSync(arg, 'utf8')))
    const found = findings(rows)
    console.log(formatReport(found, rows.length))
    process.exit(found.length ? 1 : 0)
  }
}

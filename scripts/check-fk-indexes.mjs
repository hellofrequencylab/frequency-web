#!/usr/bin/env node
// Unindexed foreign key gate (HYG-128, ADR-1554).
//
// A foreign key with no index leading with its column makes every DELETE or UPDATE of the
// referenced row scan the referencing table to check the constraint. Seven of the nine FKs the
// calendar sprint added reference `profiles`, so an account deletion scanned four calendar tables
// in turn. Three sweeps (SCAN-638, 20270345006400, HYG-127 / 20270345009000) each took the count
// to zero and the next tables brought it back, because the only reader was the Supabase
// performance advisor, which nobody consults on a pull request. This gate is the reader that
// runs on every pull request.
//
// ── WHAT IT DOES ──────────────────────────────────────────────────────────────────────────────
// It REPLAYS supabase/migrations in version order, statement by statement, keeping the state a
// fresh database would end up in: every table's foreign keys (inline `references`, table-level
// `foreign key (...) references`, `alter table ... add constraint ... foreign key`) and every
// index that could cover one (`create [unique] index`, `primary key`, `unique`, inline or as a
// constraint), through `drop table`, `drop column`, `drop constraint`, `drop index`, `rename
// column` and `rename to`. Then it asks the advisor's question of the result: for each FK, does
// an index LEAD with its column? A composite index whose first key is the column counts, as it
// does for Postgres; one whose first key is another column does not.
//
// It reads `public` (unqualified names default to it) and ignores other schemas. Comments, string
// literals and function bodies are scrubbed first, so a `references` inside a function or a
// comment is not a foreign key; the literal DDL inside a `do $$ ... $$` block IS replayed, because
// a fresh database runs it (20260709000000 adds page_settings' primary key that way).
//
// ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────────────────────────
// It does not connect to a database: db-tests proves the migrations apply, check:migrations
// proves the ledger matches, and this proves a shape both of those are blind to. Being a parser
// over SQL text it can miss an exotic construction; it is a smoke alarm for a specific, known,
// thrice-recurring failure. Its census on 2026-09-28 matched pg_constraint against pg_index on
// production exactly (the nine HYG-127 named, and zero after that migration), which is the
// control that says the parser reads this repo's SQL.
//
// ── EXCEPTIONS ARE STATED, ONE REASON EACH ────────────────────────────────────────────────────
// A FK that is deliberately unindexed goes in EXCEPTIONS as `table.column` with the reason. An
// entry whose FK later gains an index, or whose FK no longer exists, FAILS the gate, so the list
// cannot outlive its reason.
//
// Usage: `node scripts/check-fk-indexes.mjs` (or `pnpm check:fk-indexes`).
//   --dir <path>   the migrations directory (default supabase/migrations)
// Exits 1 on an unindexed FK, a stale exception, or a directory it cannot read.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const DIR = 'supabase/migrations'

/** Floors under which the gate refuses to call the tree clean: a read that found this few tables
 *  or this few foreign keys did not read this repo's migrations, whatever it was pointed at. */
export const MIN_TABLES = 100
export const MIN_FKS = 200

/** `table.column` FKs that have no covering index ON PURPOSE. One reason each. Empty is the
 *  intended steady state; an entry that stops being true fails the gate. */
export const EXCEPTIONS = {}

// ── SCRUB ─────────────────────────────────────────────────────────────────────────────────────

/** Comments, string literals and dollar-quoted bodies out; case folded. A `references` inside a
 *  plpgsql body or a comment must not read as a foreign key, and a `;` inside a body must not
 *  split a statement. */
export function scrub(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, " '' ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .toLowerCase()
}

/** Statements, split on the semicolons that survive scrubbing, PLUS the literal DDL inside
 *  dollar-quoted bodies. A `do $$ ... $$` block that adds a primary key or a unique index behind
 *  a catalog check (20260709000000 does exactly this for page_settings) is DDL a fresh database
 *  runs, so it is replayed as written; the guard reads it as applied, which is the safe direction
 *  for a body that also guards with `if not exists`. Dynamic SQL (`execute format(...)`) carries
 *  placeholders and is not replayed. */
export function statements(sql) {
  const bodies = []
  // Only a `do` block runs at migration time; a function body runs when the function is called,
  // so DDL inside one is not schema this replay should see.
  for (const m of sql.matchAll(/\bdo\s+\$([a-z_]*)\$([\s\S]*?)\$\1\$/gi)) bodies.push(m[2])
  const top = scrub(sql)
  const inner = bodies
    .map((b) =>
      b
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n]*/g, ' ')
        .replace(/'(?:[^']|'')*'/g, "''")
        .toLowerCase()
        // Inside a body a statement follows `then` / `begin` / `else` / `loop` rather than a
        // semicolon, so those become separators too.
        .replace(/\b(?:then|begin|else|loop|declare)\b/g, ';'),
    )
    .join(';')
  return `${top};${inner}`
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((s) => !/^execute\s/.test(s))
}

// ── NAMES ─────────────────────────────────────────────────────────────────────────────────────

const IDENT = '"?([a-z_][a-z0-9_]*)"?'
/** A table name as written: `public.t`, `"public"."t"`, `t`, `only t`. Returns null for another
 *  schema, which this gate does not read. */
function tableName(raw) {
  const m = new RegExp(`^(?:only\\s+)?(?:${IDENT}\\s*\\.\\s*)?${IDENT}$`).exec(raw.trim())
  if (!m) return null
  if (m[1] && m[1] !== 'public') return null
  return m[2]
}
const TABLE = `((?:only\\s+)?(?:"?[a-z_][a-z0-9_]*"?\\s*\\.\\s*)?"?[a-z_][a-z0-9_]*"?)`

/** Split a parenthesised list at top-level commas. */
function splitTop(body) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** The text between the first `(` after `from` and its matching `)`. */
function parenBody(text, from = 0) {
  const open = text.indexOf('(', from)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    if (text[i] === ')') {
      depth -= 1
      if (depth === 0) return { body: text.slice(open + 1, i), end: i }
    }
  }
  return null
}

/** The leading column of an index key list, or null when it leads with an expression. */
export function leadingColumn(keyList) {
  const first = splitTop(keyList)[0] ?? ''
  const m = new RegExp(`^${IDENT}(?:\\s+(?:asc|desc|nulls\\s+(?:first|last)|collate\\s+\\S+|[a-z_]+_ops))*$`).exec(first.trim())
  return m ? m[1] : null
}

// ── STATE ─────────────────────────────────────────────────────────────────────────────────────

/** @typedef {{ fks: Map<string, { column: string, name: string | null }>, indexes: Map<string, string | null> }} Table
 *  fks: constraint key -> { column (leading), name }; indexes: index name -> leading column. */

export function createState() {
  return { tables: new Map() }
}

function table(state, name, create = true) {
  let t = state.tables.get(name)
  if (!t && create) {
    t = { fks: new Map(), indexes: new Map() }
    state.tables.set(name, t)
  }
  return t ?? null
}

let anon = 0
function addFk(t, column, name) {
  const key = name ?? `~${(anon += 1)}:${column}`
  t.fks.set(key, { column, name })
}
function addIndex(t, name, column) {
  t.indexes.set(name ?? `~${(anon += 1)}`, column)
}

/** One column or constraint definition inside `create table (...)` or `add column`. */
function applyDefinition(t, def) {
  const d = def.trim()
  // Table-level constraints.
  let m = /^(?:constraint\s+"?([a-z0-9_]+)"?\s+)?foreign\s+key\s*\(([^)]*)\)/.exec(d)
  if (m) return addFk(t, leadingColumn(m[2]) ?? '', m[1] ?? null)
  m = /^(?:constraint\s+"?([a-z0-9_]+)"?\s+)?(?:primary\s+key|unique)\s*(?:nulls\s+(?:not\s+)?distinct\s*)?\(([^)]*)\)/.exec(d)
  if (m) return addIndex(t, m[1] ?? null, leadingColumn(m[2]))
  if (/^(?:constraint\s+"?[a-z0-9_]+"?\s+)?(?:check|exclude)\b/.test(d)) return
  if (/^like\s/.test(d)) return
  // A column definition: `name type ... [references ...] [primary key] [unique]`.
  m = new RegExp(`^${IDENT}\\s+`).exec(d)
  if (!m) return
  const column = m[1]
  const rest = d.slice(m[0].length)
  const fk = /(?:constraint\s+"?([a-z0-9_]+)"?\s+)?references\s/.exec(rest)
  if (fk) addFk(t, column, fk[1] ?? null)
  if (/\bprimary\s+key\b/.test(rest)) addIndex(t, null, column)
  if (/\bunique\b/.test(rest)) addIndex(t, null, column)
}

/** Replay one statement into the state. Exported so the test can drive it. */
export function apply(state, stmt) {
  let m
  // create table [if not exists] <t> (...)
  m = new RegExp(`^create\\s+(?:unlogged\\s+|temp(?:orary)?\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${TABLE}`).exec(stmt)
  if (m) {
    const name = tableName(m[1])
    if (!name || /^create\s+temp/.test(stmt)) return
    const body = parenBody(stmt, m[0].length)
    const t = table(state, name)
    if (body) for (const def of splitTop(body.body)) applyDefinition(t, def)
    return
  }
  // drop table [if exists] <t>[, <t>]
  m = /^drop\s+table\s+(?:if\s+exists\s+)?(.+)$/.exec(stmt)
  if (m) {
    for (const raw of m[1].replace(/\s+(?:cascade|restrict)\s*$/, '').split(',')) {
      const name = tableName(raw)
      if (name) state.tables.delete(name)
    }
    return
  }
  // create [unique] index [concurrently] [if not exists] <name> on <t> [using m] (keys) ...
  m = new RegExp(`^create\\s+(?:unique\\s+)?index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?${IDENT}\\s+on\\s+${TABLE}\\s*(?:using\\s+[a-z_]+\\s*)?`).exec(stmt)
  if (m) {
    const name = tableName(m[2])
    if (!name) return
    const body = parenBody(stmt, Math.max(0, m[0].length - 1))
    addIndex(table(state, name), m[1], body ? leadingColumn(body.body) : null)
    return
  }
  // drop index [concurrently] [if exists] <name>[, ...]
  m = /^drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(.+)$/.exec(stmt)
  if (m) {
    for (const raw of m[1].replace(/\s+(?:cascade|restrict)\s*$/, '').split(',')) {
      const idx = new RegExp(`^(?:${IDENT}\\s*\\.\\s*)?${IDENT}$`).exec(raw.trim())
      if (!idx) continue
      for (const t of state.tables.values()) t.indexes.delete(idx[2])
    }
    return
  }
  // alter table [if exists] [only] <t> <actions, comma separated>
  m = new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?${TABLE}\\s+([\\s\\S]*)$`).exec(stmt)
  if (m) {
    const name = tableName(m[1])
    if (!name) return
    const t = table(state, name)
    for (const action of splitTop(m[2])) {
      const a = action.trim()
      let am
      if ((am = /^rename\s+to\s+"?([a-z_][a-z0-9_]*)"?$/.exec(a))) {
        state.tables.delete(name)
        state.tables.set(am[1], t)
        continue
      }
      if ((am = new RegExp(`^rename\\s+(?:column\\s+)?${IDENT}\\s+to\\s+${IDENT}$`).exec(a))) {
        for (const fk of t.fks.values()) if (fk.column === am[1]) fk.column = am[2]
        for (const [k, col] of t.indexes) if (col === am[1]) t.indexes.set(k, am[2])
        continue
      }
      if ((am = /^drop\s+constraint\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/.exec(a))) {
        t.fks.delete(am[1])
        t.indexes.delete(am[1])
        // An unnamed inline FK gets Postgres's generated name `<table>_<column>_fkey`.
        for (const [k, fk] of t.fks) if (fk.name === null && `${name}_${fk.column}_fkey` === am[1]) t.fks.delete(k)
        continue
      }
      // After `drop constraint` on purpose: `drop constraint x` would otherwise read as a column named `constraint`.
      if ((am = new RegExp(`^drop\\s+(?:column\\s+)?(?:if\\s+exists\\s+)?${IDENT}`).exec(a))) {
        for (const [k, fk] of t.fks) if (fk.column === am[1]) t.fks.delete(k)
        for (const [k, col] of t.indexes) if (col === am[1]) t.indexes.delete(k)
        continue
      }
      if ((am = /^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([\s\S]+)$/.exec(a))) {
        applyDefinition(t, am[1])
        continue
      }
    }
  }
}

/** Replay every .sql file in `dir`, in name order (the version is the name's prefix). */
export function replay(dir = DIR) {
  const state = createState()
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    for (const stmt of statements(readFileSync(join(dir, f), 'utf8'))) apply(state, stmt)
  }
  return { state, files: files.length }
}

/** THE QUESTION. Every FK whose table has no index leading with its column. */
export function unindexed(state) {
  const out = []
  for (const [name, t] of state.tables) {
    const led = new Set([...t.indexes.values()].filter(Boolean))
    for (const fk of t.fks.values()) {
      if (!fk.column || led.has(fk.column)) continue
      out.push(`${name}.${fk.column}`)
    }
  }
  return [...new Set(out)].sort()
}

export function census(state) {
  let fks = 0
  for (const t of state.tables.values()) fks += t.fks.size
  return { tables: state.tables.size, fks }
}

const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`

export function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--dir')
  const dir = i >= 0 ? argv[i + 1] : DIR
  let replayed
  try {
    replayed = replay(dir)
  } catch (err) {
    console.error(red(`✗ check:fk-indexes — could not read ${dir}: ${err.message}`))
    return 1
  }
  const { state, files } = replayed
  const { tables, fks } = census(state)
  const missing = unindexed(state)
  const problems = []
  if (tables < MIN_TABLES || fks < MIN_FKS) {
    problems.push(`only ${tables} table(s) and ${fks} foreign key(s) were read from ${files} file(s), under the floors of ${MIN_TABLES} and ${MIN_FKS}: this did not read the repo's migrations, whatever it was pointed at.`)
  }
  const stale = Object.keys(EXCEPTIONS).filter((k) => !missing.includes(k)).sort()
  for (const s of stale) problems.push(`EXCEPTIONS names ${s}, which is indexed now or no longer a foreign key. Remove the entry.`)
  const real = missing.filter((k) => !Object.hasOwn(EXCEPTIONS, k))
  if (real.length) {
    problems.push(
      `${real.length} foreign key(s) have no index leading with the column, so every delete or update of the referenced row scans the referencing table:\n` +
        real.map((k) => `   · ${k}`).join('\n') +
        '\n   Add `create index if not exists <table>_<column>_idx on public.<table> (<column>)` in the migration that adds the key\n' +
        '   (partial `where <column> is not null` for a nullable attribution column, as 20270345009000 does), or, if the key is\n' +
        '   deliberately unindexed, add it to EXCEPTIONS with the reason.',
    )
  }
  console.log(`check:fk-indexes — replayed ${files} migration(s): ${tables} table(s), ${fks} foreign key(s), ${Object.keys(EXCEPTIONS).length} stated exception(s).`)
  if (problems.length) {
    console.error(red(`\n✗ check:fk-indexes — ${problems.length} problem(s):\n`))
    for (const p of problems) console.error(`${red('•')} ${p}\n`)
    return 1
  }
  console.log(green('✓ check:fk-indexes — every foreign key has an index leading with its column.'))
  return 0
}

if (invokedDirectly(import.meta.url)) process.exit(main())

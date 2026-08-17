#!/usr/bin/env node
// check:stored-blocks — stored page documents may not name a block type the registry has retired.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// ADR-978 made an unknown block type SURVIVABLE: the loader keeps a well-formed document, the
// public renderer skips the block it cannot resolve, and the editor shows a labelled placeholder.
// That is a fail-safe, and AGENTS.md states the rule about fail-safes plainly: **every fail-safe
// needs a gate that notices it fired.** Nothing noticed. Five types (`PageHero`, `ImageBand`,
// `ZigZag`, `FeatureGallery`, `BetaCTA`) sat orphaned across three draft pages for two months and
// were found BY HAND, twice — once for ADR-977 D-9 and again for backlog row LIVE-028. Between
// those two hand-audits, 6 of `about`'s 8 authored sections rendered as nothing and every gate in
// the repo was green.
//
// So the invariant is: a block type that stored data still names may not disappear from the
// registry without either a migration that rewrites the data, or a deliberate, reviewable entry
// saying so. This guard is the thing that notices.
//
// ── THE SPLIT, AND WHY THERE ARE TWO HALVES ───────────────────────────────────────────────────
//
// The registry is TSX (`lib/page-editor/config.tsx` imports React, next/image, `server-only`
// transitively), so bare node cannot read it — same constraint EDITOR-GATES §0 records for the
// block gates generally. But the real question ("does every stored type resolve?") is a runtime
// question about a live object, not a shape question an AST can answer.
//
//   · THIS FILE is pure node. It owns the census I/O, the integrity floors and the pure
//     classifier, and its CLI answers the one question that needs no registry: is the quarantine
//     empty? That is the probe for LIVE-028, and it is a CONSEQUENCE ("stored data has no
//     unresolvable types"), not a restatement of the row's title.
//   · scripts/check-stored-blocks.test.ts is the enforcing half. It imports the LIVE registry and
//     runs `classify()` against it under vitest, which branch protection already requires. It also
//     drives this module's classifier against broken fixtures, so the detector is proven to fire
//     rather than assumed to.
//
// ⚠️ WHAT THIS CANNOT SEE, stated rather than glossed. The census is a SNAPSHOT of production
// taken by hand (`recaptureQuery` is in the JSON). It catches the direction that keeps biting —
// the registry retires a type the data still uses — because the registry half is read LIVE on
// every run. It does NOT catch an orphan written to the database after the capture date; only a
// credentialled re-capture can, and this repo has no credentialled CI job (same limitation
// check:migrations rule 4 records for the ledger, and stated the same way rather than hidden).
//
// Usage:
//   node scripts/check-stored-blocks.mjs           # integrity floors + the quarantine report
//   node scripts/check-stored-blocks.mjs --probe    # 0 = clean · 1 = orphans remain · 79 = cannot tell
// Model: scripts/check-migrations.mjs (floors, loud degradation, never a vacuous pass).

import { readFileSync, existsSync } from 'node:fs'

export const CENSUS_PATH = 'scripts/stored-block-types.json'

/** The exit code that means "I could not look", per check-backlog.mjs. A probe that cannot read
 *  its own corpus must never answer 0 or 1: that is the ripgrep bug this repo already shipped
 *  once, where "I found nothing" and "I could not look" were spelled the same way. */
export const INDETERMINATE = 79

/** Floors. A census that shrank to nothing would make every assertion below vacuously true, and a
 *  ✓ printed over nothing is the one thing a gate must never do (ADR-962).
 *
 *  Measured 2026-08-17: 3 stores, 25 documents, 27 distinct types. The floors sit deliberately
 *  below those so ordinary churn does not trip them. Lower one ONLY alongside a real deletion,
 *  and name the deletion. Never to make a run green. */
export const MIN_STORES = 3
export const MIN_DOCUMENTS = 20
export const MIN_TYPES = 25

/** Read the census. Throws rather than returning a default: an empty census is the one input that
 *  would sail through classify() looking like a clean run. */
export function loadCensus(path = CENSUS_PATH, io = {}) {
  const read = io.readFile ?? ((p) => readFileSync(p, 'utf8'))
  const exists = io.exists ?? existsSync
  if (!exists(path)) throw new Error(`${path} is missing — the stored-block census is the corpus this guard measures.`)
  const doc = JSON.parse(read(path))
  if (!Array.isArray(doc.stores)) throw new Error(`${path} has no "stores" array.`)
  if (!Array.isArray(doc.quarantine)) throw new Error(`${path} has no "quarantine" array.`)
  return doc
}

/** Every type in the census, with where it was seen. Map<type, { blocks, docs, stores: string[] }>. */
export function censusTypes(census) {
  const out = new Map()
  for (const store of census.stores ?? []) {
    for (const [type, counts] of Object.entries(store.types ?? {})) {
      const prev = out.get(type) ?? { blocks: 0, docs: 0, stores: [] }
      prev.blocks += counts?.blocks ?? 0
      prev.docs += counts?.docs ?? 0
      prev.stores.push(store.store)
      out.set(type, prev)
    }
  }
  return out
}

/** The integrity floors, as a list of problems (empty = fine). Separated from classify() so the
 *  test can assert that an emptied census FAILS rather than reading as clean. */
export function integrityProblems(census, opts = {}) {
  const { minStores = MIN_STORES, minDocuments = MIN_DOCUMENTS, minTypes = MIN_TYPES } = opts
  const problems = []
  const stores = census.stores ?? []
  const documents = stores.reduce((n, s) => n + (s.documents ?? 0), 0)
  const types = censusTypes(census)

  if (stores.length < minStores) problems.push(`only ${stores.length} store(s) (floor ${minStores}) — the census looks truncated`)
  if (documents < minDocuments) problems.push(`only ${documents} document(s) (floor ${minDocuments}) — the census looks truncated`)
  if (types.size < minTypes) problems.push(`only ${types.size} distinct type(s) (floor ${minTypes}) — the census looks truncated`)
  if (!census.capturedAt) problems.push('no "capturedAt" — a corpus with no capture date cannot be reasoned about')
  for (const s of stores) {
    if (!s.store) problems.push('a store entry has no "store" name')
    if (!s.types || Object.keys(s.types).length === 0) problems.push(`store "${s.store}" records no types at all`)
  }
  return problems
}

/**
 * The whole verdict, pure.
 *
 * @param {object} census        the parsed census
 * @param {Iterable<string>} knownTypes  the LIVE registry's component keys
 * @param {{ fileExists?: (p: string) => boolean, readFile?: (p: string) => string }} [io]
 * @returns {{
 *   integrity: string[],
 *   unresolved: string[],          // in the census, not in the registry, NOT quarantined -> FAIL
 *   quarantined: string[],         // declared, and genuinely unresolved -> tolerated, printed
 *   staleQuarantine: string[],     // declared, but the registry resolves it -> FAIL (rotted claim)
 *   badSuccessor: string[],        // quarantined with a successor that does not resolve -> FAIL
 *   missingMigration: string[],    // quarantined with no migration file, or one that does not
 *                                  //   name this type -> successor pair -> FAIL
 * }}
 */
export function classify(census, knownTypes, io = {}) {
  const exists = io.fileExists ?? existsSync
  const read = io.readFile ?? ((p) => readFileSync(p, 'utf8'))

  const known = new Set(knownTypes)
  const types = censusTypes(census)
  const quarantine = census.quarantine ?? []
  const quarantineBy = new Map(quarantine.map((q) => [q.type, q]))

  const unresolved = []
  const quarantined = []
  for (const type of [...types.keys()].sort()) {
    if (known.has(type)) continue
    if (quarantineBy.has(type)) quarantined.push(type)
    else unresolved.push(type)
  }

  // A quarantine entry the registry now resolves is a claim that has rotted. It must be deleted,
  // not left standing: an entry nobody removes is how a waiver becomes permanent coverage.
  const staleQuarantine = quarantine
    .filter((q) => known.has(q.type) || !types.has(q.type))
    .map((q) => q.type)
    .sort()

  const badSuccessor = quarantine.filter((q) => !q.successor || !known.has(q.successor)).map((q) => q.type).sort()

  // The entry must point at a migration that exists AND actually maps this type to this
  // successor. Without this, "quarantined" degrades into "excused", and the excuse outlives the
  // fix — which is exactly how the previous five lists in this repo drifted.
  const missingMigration = quarantine
    .filter((q) => {
      if (!q.migration || !exists(q.migration)) return true
      let sql
      try {
        sql = read(q.migration)
      } catch {
        return true
      }
      return !mapsTypeToSuccessor(sql, q.type, q.successor)
    })
    .map((q) => q.type)
    .sort()

  return { integrity: integrityProblems(census), unresolved, quarantined, staleQuarantine, badSuccessor, missingMigration }
}

/** Does this SQL contain a `when '<type>' then … 'type', '<successor>'` rewrite? Deliberately
 *  shape-based rather than an exact-string pin: the assertion is "the migration turns THIS type
 *  into THAT one", which survives reformatting but not a changed target. */
export function mapsTypeToSuccessor(sql, type, successor) {
  if (!type || !successor) return false
  const re = new RegExp(`when\\s+'${type}'\\s+then[\\s\\S]{0,400}?'type'\\s*,\\s*'${successor}'`, 'i')
  return re.test(sql)
}

/** The human report. Returns lines + an exit code, so the tests can drive every branch. */
export function report(census, { probe = false } = {}) {
  const lines = []
  const problems = integrityProblems(census)
  if (problems.length) {
    lines.push('', `🔴 check:stored-blocks — the census failed its integrity floors (${CENSUS_PATH}):`, '')
    for (const p of problems) lines.push(`    ${p}`)
    lines.push('', '    A census that measures nothing passes everything. Re-capture it with the SQL in', `    ${CENSUS_PATH} ("recaptureQuery") rather than lowering a floor.`, '')
    return { code: INDETERMINATE, lines }
  }

  const q = census.quarantine ?? []
  const stores = census.stores ?? []
  const docs = stores.reduce((n, s) => n + (s.documents ?? 0), 0)
  const types = censusTypes(census)

  if (q.length === 0) {
    lines.push('', `✅ check:stored-blocks — ${docs} stored document(s) across ${stores.length} store(s), ${types.size} distinct block type(s), zero quarantined.`, `    Captured ${census.capturedAt}. The registry half is enforced live by scripts/check-stored-blocks.test.ts.`, '')
    return { code: 0, lines }
  }

  lines.push('', `🔴 check:stored-blocks — ${q.length} block type(s) live in stored page data and resolve to NOTHING in the registry.`, '')
  for (const e of q) {
    const seen = types.get(e.type)
    lines.push(`    ${e.type} -> ${e.successor}   (${seen?.blocks ?? '?'} block(s) in ${seen?.docs ?? '?'} document(s))`)
    lines.push(`      migration: ${e.migration}`)
  }
  lines.push('', '    Each renders as nothing on the live page today — the author\'s copy is kept but invisible.', '    Apply the migration above (two steps: supabase/migrations/README.md), then re-capture', `    ${CENSUS_PATH} and delete the quarantine entries.`, '')
  if (!probe) lines.push('    This exits non-zero on purpose: the fix is unapplied, and a green gate would say otherwise.', '')
  return { code: 1, lines }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check-stored-blocks.mjs')
if (invokedDirectly) {
  const probe = process.argv.includes('--probe')
  let census
  try {
    census = loadCensus()
  } catch (err) {
    console.error(`\n⚠️  check:stored-blocks — CANNOT TELL. ${err.message}\n`)
    process.exit(INDETERMINATE)
  }
  const { code, lines } = report(census, { probe })
  for (const l of lines) (code === 0 ? console.log : console.error)(l)
  process.exit(code)
}

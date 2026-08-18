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
// ── TWO DIFFERENT QUESTIONS, AND THEY GET DIFFERENT ANSWERS ───────────────────────────────────
//
// 🔴 THE FIRST VERSION OF THIS GUARD CONFLATED THEM, and that made it a gate nobody could go
// green against. It exited 1 for ANY orphan — including the five already declared, whose fix is a
// staged migration waiting on an OWNER to apply it. Wired into a required job, that holds every
// unrelated change hostage to an action no PR can take, which is precisely the state ADR-970 says
// gets routed around and then reads as coverage. Split:
//
//   · an UNDECLARED orphan in stored data  -> FAIL. This is the regression the guard exists for.
//   · a DECLARED (quarantined) orphan      -> PASS, LOUDLY. It is known, it names its successor
//                                             and the SQL that performs the rewrite, and those
//                                             claims are re-verified on every run. It is printed
//                                             every time so it can never fade into ordinary
//                                             coverage — the same shape as check:migrations' loud
//                                             skip and check:function-grants' LOOP_COVERED note.
//   · a quarantine entry that has ROTTED   -> FAIL, and this arm is unchanged. A successor that
//                                             does not resolve, a migration that is absent, a
//                                             migration that maps the type SOMEWHERE ELSE, or a
//                                             type the registry now resolves: all still hard
//                                             failures. Those are what stop a quarantine turning
//                                             into a permanent hole, and none of them need an
//                                             owner to clear.
//
// ⚠️ `--probe` DOES NOT TAKE THIS SPLIT, deliberately. It answers a different question — "is
// LIVE-028 done?" — and the answer while a declared orphan remains is NO. check:backlog reads it,
// the row is `open`, and an open row whose probe says NOT DONE is exactly consistent. A probe that
// went green on the declared state would close a row whose work has not happened.
//
// ── THE SPLIT BETWEEN THE TWO FILES ───────────────────────────────────────────────────────────
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
//   node scripts/check-stored-blocks.mjs           # 0 = no UNDECLARED orphan and no rotted entry
//                                                  # 1 = a quarantine entry has rotted
//                                                  # 79 = the census is unreadable / below its floors
//   node scripts/check-stored-blocks.mjs --probe    # 0 = quarantine EMPTY · 1 = orphans remain · 79 = cannot tell
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
 *  Measured 2026-08-17: 3 stores, 25 documents, 27 distinct types. Re-measured 2026-08-18 after
 *  20270305000000 rewrote the five orphan types into successors already present in the census:
 *  3 stores, 25 documents, 24 distinct types — the world legitimately shrank by the exact five
 *  the migration retired, so MIN_TYPES moves 25 -> 20 WITH that change (this is a re-capture,
 *  not a floor-lowered-to-pass; the recaptureQuery output is the diff's own evidence).
 *  The floors sit deliberately
 *  below those so ordinary churn does not trip them. Lower one ONLY alongside a real deletion,
 *  and name the deletion. Never to make a run green. */
export const MIN_STORES = 3
export const MIN_DOCUMENTS = 20
export const MIN_TYPES = 20

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

  const missingMigration = missingMigrationTypes(census, { fileExists: exists, readFile: read })

  return { integrity: integrityProblems(census), unresolved, quarantined, staleQuarantine, badSuccessor, missingMigration }
}

/**
 * Quarantined types whose migration is absent, unreadable, or does not perform THAT rewrite.
 *
 * Split out of classify() because it is the one anti-rot arm that needs no registry, so the pure
 * node CLI can enforce it too. It is also the arm that keeps the quarantine honest: without it,
 * "quarantined" degrades into "excused", and the excuse outlives the fix — which is exactly how
 * the previous five lists in this repo drifted. Existing is NOT enough; the SQL is read.
 */
export function missingMigrationTypes(census, io = {}) {
  const exists = io.fileExists ?? existsSync
  const read = io.readFile ?? ((p) => readFileSync(p, 'utf8'))
  return (census.quarantine ?? [])
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
}

/** Does this SQL contain a `when '<type>' then … 'type', '<successor>'` rewrite? Deliberately
 *  shape-based rather than an exact-string pin: the assertion is "the migration turns THIS type
 *  into THAT one", which survives reformatting but not a changed target. */
export function mapsTypeToSuccessor(sql, type, successor) {
  if (!type || !successor) return false
  const re = new RegExp(`when\\s+'${type}'\\s+then[\\s\\S]{0,400}?'type'\\s*,\\s*'${successor}'`, 'i')
  return re.test(sql)
}

/**
 * The human report. Returns lines + an exit code, so the tests can drive every branch.
 *
 * `probe: false` (the guard): 79 on a broken census · 1 on a ROTTED quarantine entry · 0 otherwise,
 * printing any declared quarantine loudly so it can never read as ordinary coverage.
 * `probe: true` (the backlog probe): 79 on a broken census · 1 while ANY orphan remains · 0 when
 * the quarantine is empty. See the header for why these two answers differ on purpose.
 */
export function report(census, { probe = false, io = {} } = {}) {
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
  const header = `${docs} stored document(s) across ${stores.length} store(s), ${types.size} distinct block type(s), captured ${census.capturedAt}`

  // ── the probe: "is LIVE-028 done?" ──────────────────────────────────────────────────────────
  if (probe) {
    if (q.length === 0) {
      lines.push('', `✅ check:stored-blocks — ${header}. Zero orphan block types remain in stored page data.`, '')
      return { code: 0, lines }
    }
    lines.push('', `⏳ check:stored-blocks — ${q.length} orphan block type(s) still in stored page data:`, '')
    for (const e of q) {
      const seen = types.get(e.type)
      lines.push(`    ${e.type} -> ${e.successor}   (${seen?.blocks ?? '?'} block(s) in ${seen?.docs ?? '?'} document(s))`)
    }
    lines.push('', `    The fix is written and waiting on the owner: ${q[0]?.migration}`, '    NOT DONE, which is what an open backlog row should hear.', '')
    return { code: 1, lines }
  }

  // ── the guard: "has anything gone wrong that a PR can fix?" ─────────────────────────────────
  const rotted = missingMigrationTypes(census, io)
  if (rotted.length) {
    lines.push('', `🔴 check:stored-blocks — ${rotted.length} quarantine entr(y/ies) no longer name a migration that performs their rewrite:`, '')
    for (const type of rotted) {
      const e = q.find((x) => x.type === type)
      lines.push(`    ${type} -> ${e?.successor ?? '?'}   migration: ${e?.migration ?? '(none declared)'}`)
    }
    lines.push(
      '',
      '    A quarantine entry is tolerated ONLY while its fix is in the tree. The file must exist',
      '    AND contain the rewrite it claims — existing is not enough, or "quarantined" quietly',
      `    becomes "excused". Fix the entry in ${CENSUS_PATH}, or restore the SQL.`,
      '',
    )
    return { code: 1, lines }
  }

  if (q.length === 0) {
    lines.push('', `✅ check:stored-blocks — ${header}. Every stored block type resolves; nothing quarantined.`, '    The registry half is enforced live by scripts/check-stored-blocks.test.ts.', '')
    return { code: 0, lines }
  }

  // PASS, LOUDLY. Declared, verified, and waiting on an owner — not a defect a PR can clear, so
  // it must not fail a required job. Printed in full on EVERY run so it cannot fade into silence.
  lines.push('', `✅ check:stored-blocks — ${header}. No UNDECLARED orphan block type.`, '')
  lines.push(`⏳ ${q.length} DECLARED orphan(s) below. They render as nothing on a live page today — the author's`, '   copy is kept but invisible — and each is waiting on an OWNER action, not on a PR:', '')
  for (const e of q) {
    const seen = types.get(e.type)
    lines.push(`    ${e.type} -> ${e.successor}   (${seen?.blocks ?? '?'} block(s) in ${seen?.docs ?? '?'} document(s))  ${e.adr ?? ''}`)
    lines.push(`      fix: ${e.migration}`)
  }
  lines.push(
    '',
    '    Re-verified on THIS run: each migration exists and performs that exact rewrite. That each',
    '    successor still resolves, and that no OTHER stored type has gone unresolvable, needs the',
    '    TSX registry and is asserted by scripts/check-stored-blocks.test.ts under `pnpm test`.',
    '    Promote + apply the SQL, then re-capture',
    `    ${CENSUS_PATH}; this list empties and \`--probe\` goes 1 -> 0.`,
    '',
    '    This is a PASS, not coverage: an UNDECLARED orphan still fails, and so does an entry whose',
    '    claims have rotted. It is printed every run so nobody mistakes the difference.',
    '',
  )
  return { code: 0, lines }
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
  // A declared quarantine prints on stdout even though it is loud: it is a PASS, and routing a
  // pass through stderr is how a notice starts reading as a failure in a CI log.
  for (const l of lines) (code === 0 ? console.log : console.error)(l)
  process.exit(code)
}

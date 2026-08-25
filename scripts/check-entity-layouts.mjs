#!/usr/bin/env node
// check:entity-layouts — an entity-block type that stored layout data still names may not vanish
// from the registry, and THE BENCH COUNTS.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// `check:stored-blocks` (ADR-1055) covers the Puck-shaped registry and its `pages` documents. It
// says so in its own scope line: "the Spotlight union and the entity-block registry are separate
// catalogs with separate storage and are NOT covered here." So the 37 EntityLayout documents —
// 18 Space profiles and the 19 email documents that two live crons send from — had no gate at all.
//
// This is the same invariant on the other catalog, plus one arm that catalog needs and the Puck
// one does not:
//
// 🔴 THE BENCH. In an EntityLayout the authored content bag is a SIBLING map keyed by block id
//    (`EntityLayout.content`), and `rows-ops.ts:13-15` uses that map as the storage for a BENCHED
//    block: "benching a block removes it from its column so it falls back to the derived bench
//    tray WITH ITS CONFIG INTACT". A benched block therefore appears in NO cell, so its type is
//    invisible to any guard that walks placements. Measured 2026-08-25: **35 such bags, in 18 of
//    18 Space documents** (ADR-1129).
//
// ⚠️ STATED PRECISELY, BECAUSE THE OVERSTATED VERSION WOULD BE WRONG. Corpus-wide today, every
//    benched type is ALSO placed in some other document, so the bench arm changes no verdict on
//    the tree as it stands. What it changes is how close the tree is to a silent one:
//
//        about      placed in  1 of 18 documents, benched in 17
//        story      placed in  2 of 18 documents, benched in 16
//
//    Three operator edits — removing the only placements of `about` and `story` — and 33 authored
//    bags are live with no cell naming their type anywhere. A placements-only guard would then be
//    green while retiring either row erased them. That is the fail-safe-with-no-gate failure
//    AGENTS.md names, and the arm is here so it is closed BEFORE the edit rather than after.
//
// ── THE SPLIT, AND WHY IT IS THE SAME SPLIT AS check:stored-blocks ────────────────────────────
//
// This file is pure node and cannot import a TS registry. So it owns the questions that need no
// registry — the corpus's own integrity, and the shape of every document in it — and
// `scripts/check-entity-layouts.test.ts` owns the two that do: does every type still RESOLVE, and
// is every type LEGAL for the kind of the store it was found in. Two halves, one classifier, so
// they cannot disagree about what an orphan is.
//
// Model: scripts/check-stored-blocks.mjs, deliberately, down to the exit codes.

import { readFileSync, existsSync } from 'node:fs'

export const CORPUS_PATH = 'scripts/entity-layout-corpus.json'

/** "I could not look" — never 0 and never 1. Same value and same reasoning as
 *  check-stored-blocks.mjs and check-backlog.mjs: a corpus this guard cannot read is not a verdict. */
export const INDETERMINATE = 79

/** Floors. A corpus that shrank to nothing makes every assertion below vacuously true, and a ✓
 *  printed over nothing is the one thing a gate must never do (ADR-962).
 *
 *  Measured 2026-08-25: 3 stores, 37 documents, 25 placed types, 226 placements, 35 benched bags.
 *  The floors sit below those so ordinary churn does not trip them. Lower one ONLY alongside a
 *  real deletion, and name the deletion in the same diff. Never to make a run green. */
export const MIN_STORES = 3
export const MIN_DOCUMENTS = 30
export const MIN_TYPES = 20

/** Read the corpus. Throws rather than defaulting: an empty corpus is the one input that would
 *  sail through every classifier below looking like a clean run. */
export function loadCorpus(path = CORPUS_PATH, io = {}) {
  const read = io.readFile ?? ((p) => readFileSync(p, 'utf8'))
  const exists = io.exists ?? existsSync
  if (!exists(path)) throw new Error(`${path} is missing — it is the corpus this guard measures.`)
  const doc = JSON.parse(read(path))
  if (!Array.isArray(doc.documents)) throw new Error(`${path} has no "documents" array.`)
  return doc
}

/** Every block type the corpus names, and HOW it is named. `placed` is a cell reference; `benched`
 *  is a non-empty content/style bag with no cell reference; `hidden` is a document-level hidden id.
 *  Returns Map<type, { placed, benched, hidden, docs: Set<string>, kinds: Set<string> }>. */
export function corpusTypes(corpus) {
  const out = new Map()
  const touch = (type, doc) => {
    let e = out.get(type)
    if (!e) {
      e = { placed: 0, benched: 0, hidden: 0, docs: new Set(), kinds: new Set() }
      out.set(type, e)
    }
    e.docs.add(doc.id)
    if (doc.kind) e.kinds.add(doc.kind)
    return e
  }
  for (const doc of corpus.documents ?? []) {
    const placed = new Set()
    for (const row of doc.rows ?? []) {
      for (const stack of row.cells ?? []) {
        for (const type of stack ?? []) {
          if (typeof type !== 'string') continue
          placed.add(type)
          touch(type, doc).placed += 1
        }
      }
    }
    for (const map of [doc.contentKeys ?? {}, doc.styleKeys ?? {}]) {
      for (const [type, fields] of Object.entries(map)) {
        // An EMPTY bag is not author work (`divider: {}` occurs on 8 live email documents). It is
        // not evidence the type is in use, so it does not earn the type an entry here.
        if (!Array.isArray(fields) || fields.length === 0 || placed.has(type)) continue
        touch(type, doc).benched += 1
      }
    }
    for (const type of doc.hidden ?? []) {
      if (typeof type !== 'string' || placed.has(type)) continue
      touch(type, doc).hidden += 1
    }
  }
  return out
}

/** The integrity floors plus per-document shape, as a list of problems (empty = fine). Separate
 *  from classify() so a test can assert that an EMPTIED corpus fails rather than reading clean. */
export function integrityProblems(corpus, opts = {}) {
  const { minStores = MIN_STORES, minDocuments = MIN_DOCUMENTS, minTypes = MIN_TYPES } = opts
  const problems = []
  const docs = corpus.documents ?? []
  const stores = new Set(docs.map((d) => d.store).filter(Boolean))
  const types = corpusTypes(corpus)

  if (stores.size < minStores) problems.push(`only ${stores.size} store(s) (floor ${minStores}) — the corpus looks truncated`)
  if (docs.length < minDocuments) problems.push(`only ${docs.length} document(s) (floor ${minDocuments}) — the corpus looks truncated`)
  if (types.size < minTypes) problems.push(`only ${types.size} distinct type(s) (floor ${minTypes}) — the corpus looks truncated`)
  if (!corpus.capturedAt) problems.push('no "capturedAt" — a corpus with no capture date cannot be reasoned about')
  if (!corpus.recaptureQuery) problems.push('no "recaptureQuery" — a corpus nobody can re-capture rots into a claim')

  for (const d of docs) {
    const at = `document "${d.id ?? '(unnamed)'}"`
    if (!d.id) problems.push('a document has no "id"')
    if (!d.store) problems.push(`${at} has no "store"`)
    if (!d.kind) problems.push(`${at} has no "kind" — kind legality cannot be checked without it`)
    if (!Array.isArray(d.rows)) problems.push(`${at} has no "rows" array`)
    for (const row of d.rows ?? []) {
      if (!Array.isArray(row.cells)) problems.push(`${at} row "${row.id}" has no "cells" array`)
      else if (row.cells.length !== row.columns) {
        problems.push(`${at} row "${row.id}" declares ${row.columns} column(s) but holds ${row.cells.length} cell stack(s)`)
      }
    }
  }
  return problems
}

/**
 * The whole verdict, pure. Four fields, and each one is a different failure:
 *
 *   integrity          the corpus itself is unusable -> INDETERMINATE, never a verdict
 *   unresolvedPlaced   named by a cell, not in the registry -> FAIL. Renders as nothing today
 *   unresolvedBenched  named ONLY by an authored bag or a hidden id -> FAIL, and invisible to
 *                      every other gate in the repo. This arm is the point of the file
 *   illegalKind        stored on a kind the registry row does not declare -> FAIL. A narrowed
 *                      `kinds[]` under live data is a retirement wearing a different hat
 *
 * @param {object} corpus  the parsed corpus
 * @param {Array<{ id: string, kinds: readonly string[] }>} registry  the LIVE ENTITY_BLOCKS rows
 */
export function classify(corpus, registry) {
  const rows = new Map((registry ?? []).map((b) => [b.id, b]))
  const types = corpusTypes(corpus)

  const unresolvedPlaced = []
  const unresolvedBenched = []
  const illegalKind = []
  for (const [type, seen] of [...types.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const row = rows.get(type)
    if (!row) {
      if (seen.placed > 0) unresolvedPlaced.push(type)
      else unresolvedBenched.push(type)
      continue
    }
    for (const kind of [...seen.kinds].sort()) {
      if (!row.kinds?.includes(kind)) illegalKind.push({ type, kind, kinds: [...(row.kinds ?? [])] })
    }
  }

  return { integrity: integrityProblems(corpus), unresolvedPlaced, unresolvedBenched, illegalKind }
}

/**
 * The human report. Returns lines + an exit code so the tests can drive every branch.
 *
 * `registry` is optional: the pure-node CLI has none (it cannot import TS), so it reports the
 * census and its integrity only, and says so rather than implying it checked resolution.
 *
 * @param {object} corpus
 * @param {{ registry?: Array<{ id: string, kinds: readonly string[] }> | null }} [options]
 * @returns {{ code: number, lines: string[] }}
 */
export function report(corpus, { registry = null } = {}) {
  const lines = []
  const problems = integrityProblems(corpus)
  if (problems.length) {
    lines.push('', `🔴 check:entity-layouts — the corpus failed its integrity floors (${CORPUS_PATH}):`, '')
    for (const p of problems) lines.push(`    ${p}`)
    lines.push(
      '',
      '    A corpus that measures nothing passes everything. Re-capture it with the SQL in',
      `    ${CORPUS_PATH} ("recaptureQuery") rather than lowering a floor.`,
      '',
    )
    return { code: INDETERMINATE, lines }
  }

  const docs = corpus.documents ?? []
  const stores = new Set(docs.map((d) => d.store))
  const types = corpusTypes(corpus)
  const placements = [...types.values()].reduce((n, t) => n + t.placed, 0)
  const benched = [...types.values()].reduce((n, t) => n + t.benched, 0)
  const header =
    `${docs.length} document(s) across ${stores.size} store(s), ${types.size} distinct block type(s), ` +
    `${placements} placement(s), ${benched} benched bag(s), captured ${corpus.capturedAt}`

  if (!registry) {
    lines.push(
      '',
      `✅ check:entity-layouts — ${header}.`,
      '    Integrity only: this CLI is pure node and cannot import lib/entity-blocks/registry.ts.',
      '    Resolution + kind legality are enforced live by scripts/check-entity-layouts.test.ts.',
      '',
    )
    return { code: 0, lines }
  }

  const { unresolvedPlaced, unresolvedBenched, illegalKind } = classify(corpus, registry)
  if (unresolvedPlaced.length || unresolvedBenched.length || illegalKind.length) {
    lines.push('', `🔴 check:entity-layouts — stored layout data names something the registry does not offer:`, '')
    for (const t of unresolvedPlaced) {
      const s = types.get(t)
      lines.push(`    ${t}   PLACED in ${s.placed} cell(s) across ${s.docs.size} document(s) — renders as nothing today`)
    }
    for (const t of unresolvedBenched) {
      const s = types.get(t)
      lines.push(`    ${t}   BENCHED: ${s.benched} authored bag(s) in ${s.docs.size} document(s), referenced by no cell`)
    }
    for (const { type, kind, kinds } of illegalKind) {
      lines.push(`    ${type}   stored on kind "${kind}", registry declares kinds [${kinds.join(', ')}]`)
    }
    lines.push(
      '',
      '    Either restore the row, or ship a migration that rewrites the stored documents and',
      `    re-capture ${CORPUS_PATH}. Deleting the corpus entry is not a fix.`,
      '',
    )
    return { code: 1, lines }
  }

  lines.push('', `✅ check:entity-layouts — ${header}. Every stored entity-block type resolves and is legal for its kind.`, '')
  return { code: 0, lines }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  let corpus
  try {
    corpus = loadCorpus()
  } catch (err) {
    console.error(`\n🔴 check:entity-layouts — ${err.message}\n`)
    process.exit(INDETERMINATE)
  }
  const { code, lines } = report(corpus)
  console.log(lines.join('\n'))
  process.exit(code)
}

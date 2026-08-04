#!/usr/bin/env node
// ADR ledger contract (PRESENTATION.md "DECISIONS.md is the ledger").
//
// DECISIONS.md is cited BY NUMBER from other docs, commit messages, and code comments
// ("see ADR-509"). A duplicate number breaks every one of those citations at once: the
// reference silently becomes ambiguous, and a reader lands on whichever entry they find
// first. This happened for real — two parallel numbering series collided and left seven
// numbers (088-094, 875) each naming two or three unrelated decisions, so "ADR-090"
// currently means three different things. Those are grandfathered below; renumbering
// them would break existing citations, which is the exact harm this guard prevents.
//
// The guard enforces one thing a reviewer cannot eyeball across a 16k-line ledger:
// every NEW ADR number is unique. Intentional variants keep working: a letter suffix
// (ADR-544b) parses as its own id.
//
// Usage: `node scripts/check-adr.mjs` (or `pnpm check:adr`). Exits 1 on violation.
// Model: scripts/check-migrations.mjs (same bug class: a ledger keyed on an id that
// nothing machine-checked).

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LEDGER = join('docs', 'DECISIONS.md')
const HEADING = /^## ADR-(\d+[a-z]?)\b/

// Historical collisions, frozen at their current counts. A number here may appear
// exactly this many times; appearing MORE means a new collision was just added.
/** ADR numbers CITED in the tree that have no entry, frozen on 2026-08-04.
 *
 *  A RATCHET, not a waiver, and the same contract as scripts/adoption-baselines.json and the
 *  a11y baselines (ADR-928): these 13 are pre-existing debt, and a FOURTEENTH fails the build.
 *  They were invisible until the citation scan below existed, because the duplicate check counts
 *  headings against each other and a number with zero headings is simply absent from that map.
 *
 *  Two of the original 15 were written the same day this list was created (ADR-913 and ADR-918,
 *  reconstructed from their authoring commits) because they were the load-bearing ones: 82
 *  citations between them, covering the live money model and the CMS pricing invariant. The rest
 *  are older and mostly cited from superseded planning docs. Shrink this list; never grow it. */
const KNOWN_MISSING = new Set([
  '052', '053', '054', '055', '056', '057', // the earliest cluster, cited from DECISIONS/DATABASE/ARCHITECTURE
  '188', '314', '447', '448', '624', '788', '790', '845',
])

const GRANDFATHERED = new Map([
  ['088', 2],
  ['089', 2],
  ['090', 3],
  ['091', 2],
  ['092', 2],
  ['093', 2],
  ['094', 2],
  ['875', 2],
])

export function runCheck(text = readFileSync(LEDGER, 'utf8')) {
  const counts = new Map()
  for (const line of text.split('\n')) {
    const m = HEADING.exec(line)
    if (!m) continue
    const id = m[1]
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const collisions = [...counts.entries()]
    .filter(([id, n]) => n > (GRANDFATHERED.get(id) ?? 1))
    .map(([id, n]) => ({ id, count: n, allowed: GRANDFATHERED.get(id) ?? 1 }))

  const stale = [...GRANDFATHERED.entries()]
    .filter(([id, n]) => (counts.get(id) ?? 0) < n)
    .map(([id, n]) => ({ id, expected: n, found: counts.get(id) ?? 0 }))

  return { total: counts.size, collisions, stale, defined: new Set(counts.keys()) }
}

/** Every `ADR-NNN` CITED anywhere in the repo that has no `## ADR-NNN` heading.
 *
 *  This guard exists because ADR-913 and ADR-918 were cited 82 times across code, tests, CI
 *  guards and 20 docs while neither had ever been written -- in any commit, on any ref. The
 *  duplicate check above could not see it: it counts headings and compares them to each other,
 *  so a number with ZERO headings is simply absent from its map. A reader following one of those
 *  citations for the rationale found nothing, and nothing failed. */
export function findDanglingCitations(defined) {
  const roots = ['app', 'lib', 'components', 'scripts', 'docs', 'supabase', 'test']
  const cited = new Map()
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) { walk(full); continue }
      if (!/\.(ts|tsx|mts|mjs|js|md|sql)$/.test(e.name)) continue
      const text = readFileSync(full, 'utf8')
      for (const m of text.matchAll(/\bADR-(\d{2,4})\b/g)) {
        // Normalized to 3 digits: the ledger writes ADR-089 while prose sometimes writes
        // ADR-89, and those are the same decision, not a missing one.
        const id = String(Number(m[1])).padStart(3, '0')
        if (!cited.has(id)) cited.set(id, full)
      }
    }
  }
  for (const r of roots) walk(r)
  const normalizedDefined = new Set([...defined].map((d) => String(Number(d)).padStart(3, '0')))
  return [...cited.entries()]
    .filter(([id]) => !normalizedDefined.has(id) && !KNOWN_MISSING.has(id))
    .map(([id, firstSeen]) => ({ id, firstSeen }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function main() {
  const { total, collisions, stale, defined } = runCheck()
  const dangling = findDanglingCitations(defined)

  if (collisions.length === 0 && stale.length === 0 && dangling.length === 0) {
    console.log(
      `✓ ADR contract: ${total} distinct ADR number(s), no new duplicates, ` +
        'and every cited number resolves to an entry.',
    )
    return
  }

  console.error('\n✗ ADR ledger check failed:\n')

  for (const c of collisions) {
    console.error(
      `  • ADR-${c.id} appears ${c.count}× (allowed ${c.allowed}). A citation to "ADR-${c.id}"\n` +
        '    is now ambiguous. Renumber the NEW entry to the next free number (see the top\n' +
        '    of the ledger for the current max), keeping the old entries untouched.\n',
    )
  }

  for (const d of dangling) {
    console.error(
      `  • ADR-${d.id} is CITED but never written. First seen: ${d.firstSeen}\n` +
        '    A citation is a promise that a reader can go and find the reasoning. Either add\n' +
        `    the entry at that number, or correct the citation to the ADR that really covers it.\n`,
    )
  }

  for (const s of stale) {
    console.error(
      `  • Grandfather list is stale: ADR-${s.id} expected ${s.expected}× but found ${s.found}×.\n` +
        '    If duplicates were deliberately resolved, shrink GRANDFATHERED in\n' +
        '    scripts/check-adr.mjs to match.\n',
    )
  }

  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

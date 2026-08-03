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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LEDGER = join('docs', 'DECISIONS.md')
const HEADING = /^## ADR-(\d+[a-z]?)\b/

// Historical collisions, frozen at their current counts. A number here may appear
// exactly this many times; appearing MORE means a new collision was just added.
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

  return { total: counts.size, collisions, stale }
}

function main() {
  const { total, collisions, stale } = runCheck()

  if (collisions.length === 0 && stale.length === 0) {
    console.log(
      `✓ ADR contract: ${total} distinct ADR number(s), no new duplicates ` +
        '(citations by number stay unambiguous).',
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

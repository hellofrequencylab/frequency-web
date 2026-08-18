#!/usr/bin/env node
// ADR ledger contract (PRESENTATION.md "DECISIONS.md is the ledger").
//
// DECISIONS.md is cited BY NUMBER from other docs, commit messages, and code comments
// ("see ADR-509"). A duplicate number breaks every one of those citations at once: the
// reference silently becomes ambiguous, and a reader lands on whichever entry they find
// first. This happened for real: three concurrent sessions (QR platform, community comms,
// demo Seed Studio) plus a page-kit entry and a pricing entry collided on EIGHT numbers,
// 088-094 and 875, with 090 naming three unrelated decisions at once.
//
// ── RESOLVED 2026-08-17 (HYG-003). There is no grandfather list any more. ─────────────
// Nine later claimants were renumbered to the end of the sequence, keeping the number with
// the decision the repo's live citations already meant, and every citation of a moved entry
// was repointed in the same pass:
//   ADR-1044 ← 088 QR Studio authors codes on the node engine
//   ADR-1045 ← 089 Dynamic QR links as a first-class `qr_codes` entity
//   ADR-1046 ← 090 Page-template kit completed
//   ADR-1047 ← 090 Demo content v2
//   ADR-1048 ← 091 Demo Seed Studio + seed/claim/decay
//   ADR-1049 ← 092 Retire the hand-built 250-cast
//   ADR-1050 ← 093 Seed Studio generates the full connection web
//   ADR-1051 ← 094 Beta induction sequences
//   ADR-1052 ← 875 The pricing page is DERIVED
// 088/089 stayed with the community-communication pair (COMMS-STRATEGY.md §"ADRs" names
// them and says the QR/demo sessions double-booked those numbers), 090-094 stayed with the
// QR platform (DEVELOPMENT-MAP.md logs that series by number across 2026-06-04/05), and 875
// stayed with the beta founder push (26 of its 30 live citations are that decision).
//
// The guard enforces one thing a reviewer cannot eyeball across a 25k-line ledger:
// EVERY ADR number is unique — not "no worse than a frozen baseline", which is what let
// eight collisions sit in the tree while this file reported ✓. Intentional variants keep
// working: a letter suffix (ADR-544b) parses as its own id.
//
// Usage: `node scripts/check-adr.mjs` (or `pnpm check:adr`). Exits 1 on violation.
// Model: scripts/check-migrations.mjs (same bug class: a ledger keyed on an id that
// nothing machine-checked).

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const LEDGER = join('docs', 'DECISIONS.md')
// `#{2,3}`, not `##`. Seven entries in the ledger use a ### heading -- ADR-052 through
// ADR-057 and ADR-156a -- and a `^## ` regex simply does not see them. When the citation
// scan below was first switched on it therefore reported six FULLY WRITTEN decisions as
// missing, including ADR-056 (the RLS SECURITY DEFINER pattern) which is cited from 17
// live migrations and a contract test. Verified collision-safe: widening introduces no
// duplicate ids.
const HEADING = /^#{2,3} ADR-(\d+[a-z]?)\b/

/** ADR numbers CITED in the tree that have no entry, frozen on 2026-08-04. EIGHT of them.
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
  // EMPTY, and the goal is that it stays that way (2026-08-04).
  //
  // It held eight entries. Five were real decisions that shipped without a record -- 624
  // (contacts uniqueness per-space), 845 (circle handoff + generic cover focus), 788 (Profile &
  // Settings as a real hub tab), 447 (practice library Phase 3 "Grow"), 790 (admin search above
  // the sub-nav) -- and all five are now written in docs/DECISIONS.md, reconstructed from the
  // shipped code, the migrations and the commit messages that promised them.
  //
  // The other three were never decisions at all: prose ABOUT numbering that this scanner cannot
  // distinguish from a citation. Rather than grant them permanent exemptions, the prose was
  // reworded to stop looking like a reference -- the numbers are written bare, without the `ADR-`
  // prefix, and say outright that no such record exists.
  //
  // Adding an entry here is now an admission that a cited decision has no record. Prefer writing
  // the ADR, or rewording the citation if it was never a decision.
])

/** Every ADR number, and the ledger lines it is declared on.
 *
 *  ⚠️ NO ALLOWANCE ARGUMENT, deliberately. The previous version compared each count against a
 *  frozen GRANDFATHERED map, so the eight live collisions it was written to describe made it
 *  print ✓ — the guard measured "no WORSE than the day it shipped", and a reader took the tick
 *  for "no duplicates". The baseline is now the rule: a number appearing twice is a failure,
 *  whatever the history. Line numbers ride along so the failure names both claimants. */
export function runCheck(text = readFileSync(LEDGER, 'utf8')) {
  const counts = new Map()
  text.split('\n').forEach((line, i) => {
    const m = HEADING.exec(line)
    if (!m) return
    const id = m[1]
    if (!counts.has(id)) counts.set(id, [])
    counts.get(id).push(i + 1)
  })

  const collisions = [...counts.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([id, lines]) => ({ id, count: lines.length, lines }))

  return { total: counts.size, collisions, defined: new Set(counts.keys()) }
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
  const { total, collisions, defined } = runCheck()
  const dangling = findDanglingCitations(defined)

  if (collisions.length === 0 && dangling.length === 0) {
    console.log(
      `✓ ADR contract: ${total} distinct ADR number(s), each declared exactly once, ` +
        'and every cited number resolves to an entry.',
    )
    return
  }

  console.error('\n✗ ADR ledger check failed:\n')

  const max = Math.max(0, ...[...defined].map((d) => parseInt(d, 10)).filter(Number.isFinite))

  for (const c of collisions) {
    console.error(
      `  • ADR-${c.id} is declared ${c.count}× — ${LEDGER} lines ${c.lines.join(', ')}.\n` +
        `    Every citation of "ADR-${c.id}" is now ambiguous: a reader lands on whichever\n` +
        `    entry they find first. Renumber the LATER claimant to ADR-${max + 1} (the next\n` +
        '    free number) and repoint the citations that meant IT — not the ones that meant\n' +
        '    the entry keeping the number.\n',
    )
  }

  for (const d of dangling) {
    console.error(
      `  • ADR-${d.id} is CITED but never written. First seen: ${d.firstSeen}\n` +
        '    A citation is a promise that a reader can go and find the reasoning. Either add\n' +
        `    the entry at that number, or correct the citation to the ADR that really covers it.\n`,
    )
  }

  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

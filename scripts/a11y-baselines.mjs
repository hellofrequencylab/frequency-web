#!/usr/bin/env node
// Merge an accessibility CAPTURE run into test/e2e/a11y-baselines.json.
//
// Why this exists rather than a hand-written table: a ratchet is only worth having if its
// numbers came from the thing it guards. A hand-typed baseline is a guess, and a guessed
// baseline is a lie that survives in version control. So the suite writes what it actually
// observed (PW_A11Y_UPDATE=1 → one JSON line per context) and this merges those lines.
//
// The merge is deliberately ASYMMETRIC:
//   · a count that FELL is written down     — progress is locked in immediately
//   · a count that ROSE is REFUSED          — that is a regression, and the run should have
//                                             failed; silently accepting it would launder a
//                                             regression into the baseline
// Raising a baseline is therefore a manual edit, in the same commit as the reason.
//
// Usage:
//   PW_A11Y_UPDATE=1 pnpm exec playwright test --grep @a11y      # capture
//   node scripts/a11y-baselines.mjs                              # merge (add --force to raise)

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OBSERVED = join('test', 'e2e', '.a11y-observed.jsonl')
const BASELINES = join('test', 'e2e', 'a11y-baselines.json')

const force = process.argv.includes('--force')

if (!existsSync(OBSERVED)) {
  console.error(
    `✗ No capture found at ${OBSERVED}.\n` +
      `  Run: PW_A11Y_UPDATE=1 pnpm exec playwright test --grep @a11y (with PW_BASE_URL set)`,
  )
  process.exit(1)
}

const observed = new Map()
for (const line of readFileSync(OBSERVED, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed) continue
  let row
  try {
    row = JSON.parse(trimmed)
  } catch {
    continue
  }
  if (typeof row?.context !== 'string' || typeof row?.total !== 'number') continue
  // A context can appear twice when Playwright retries; the LAST write is the one that counts.
  observed.set(row.context, row.total)
}

if (observed.size === 0) {
  console.error('✗ The capture file held no usable rows. Nothing merged.')
  process.exit(1)
}

const doc = JSON.parse(readFileSync(BASELINES, 'utf8'))
doc.surfaces ??= {}

const fell = []
const rose = []
const added = []

for (const [context, total] of [...observed].sort(([a], [b]) => a.localeCompare(b))) {
  const current = doc.surfaces[context]
  if (current === undefined) {
    if (total > 0) added.push([context, total])
    doc.surfaces[context] = total
  } else if (total < current) {
    fell.push([context, current, total])
    doc.surfaces[context] = total
  } else if (total > current) {
    rose.push([context, current, total])
    if (force) doc.surfaces[context] = total
  }
}

// Drop contexts that no longer exist, so a retired surface cannot hide debt forever.
for (const context of Object.keys(doc.surfaces)) {
  if (!observed.has(context)) delete doc.surfaces[context]
}

if (rose.length > 0 && !force) {
  console.error(`✗ ${rose.length} context(s) REGRESSED. Baselines not raised:`)
  for (const [context, from, to] of rose) console.error(`    ${context}: ${from} → ${to}`)
  console.error('\n  Fix the regression, or re-run with --force and say why in the commit.')
  process.exit(1)
}

writeFileSync(BASELINES, JSON.stringify(doc, null, 2) + '\n')
unlinkSync(OBSERVED)

const clean = [...observed.values()].filter((n) => n === 0).length
console.log(`✓ a11y baselines merged: ${observed.size} context(s), ${clean} already clean.`)
for (const [context, total] of added) console.log(`    + ${context}: ${total}`)
for (const [context, from, to] of fell) console.log(`    ↓ ${context}: ${from} → ${to} (improved)`)
if (rose.length > 0) for (const [context, from, to] of rose) console.log(`    ↑ ${context}: ${from} → ${to} (FORCED)`)

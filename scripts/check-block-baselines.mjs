#!/usr/bin/env node
// check:block-baselines — the E2 consolidation RATCHET (docs/EDITOR-ARCHITECTURE.md §7.3, EDITOR-GATES §6).
//
// A sibling of check:adoption for STRUCTURAL counts (not regex-over-files). It reuses that harness's provenance
// integrity, basis fingerprint and asymmetric merge, so a fall is written down, a rise is refused without
// `--allow-raise --reason`, and a hand-edited number fails. What differs is `basis`: it fingerprints the MANIFEST
// (the files that define the thing counted), carried in `patterns`, so renaming a system cannot book a phantom win.
//
// Seeded with ONE key today, `block-systems`: how many independent block systems still exist in the tree.
// EDITOR-ARCHITECTURE measured 5; the E2 gate is 1. The other five keys in §7.3 each need a counter nobody has
// run yet and are NOT seeded here: a baseline nobody measured is the failure that section exists to prevent.
//
// WHAT IT CANNOT SEE: that a system's file merely exists says nothing about how many block types it holds
// (that is `block-types-total`, still owed). Deleting a system's entry file lowers the count; so does moving it
// without updating the manifest, which is why the manifest is part of the basis and a change demands a re-freeze.
//
// Usage: node scripts/check-block-baselines.mjs
//        node scripts/check-block-baselines.mjs --update --reason "<why>" [--allow-raise]

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { auditProvenance, mergeBaselines } from './check-adoption.mjs'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const BASELINES = 'scripts/block-baselines.json'
/** The anchor: if the entity registry is gone, every count below would read as progress. Fail loud instead. */
export const ANCHOR = 'lib/entity-blocks/registry.ts'

/** Measure one entry: how many of its manifest paths still exist. */
export function measure(entry, exists = existsSync) {
  return (entry.patterns ?? []).filter((p) => exists(p)).length
}

/** Problems for a config against a tree. Empty when every key holds its floor and every baseline accounts for itself. */
export function problems(config, exists = existsSync) {
  const out = []
  if (!exists(ANCHOR)) return { code: 79, out: [`${ANCHOR} not found: the gate has nothing to count and would read as a win.`], rows: [] }
  if (!Array.isArray(config.entries) || config.entries.length === 0) {
    return { code: 79, out: ['block-baselines.json has no entries: the gate would pass over nothing.'], rows: [] }
  }
  out.push(...auditProvenance(config.entries))
  const rows = config.entries.map((entry) => {
    const current = measure(entry, exists)
    return { key: entry.key, baseline: entry.baseline, current, delta: current - entry.baseline }
  })
  for (const r of rows) {
    if (r.delta > 0) out.push(`${r.key}: ${r.current} is above the frozen ${r.baseline}. A block system was added; consolidation only goes down.`)
  }
  return { code: out.length ? 1 : 0, out, rows }
}

function main() {
  const config = JSON.parse(readFileSync(BASELINES, 'utf8'))
  const args = process.argv.slice(2)
  const { code, out, rows } = problems(config)
  if (args.includes('--update')) {
    const i = args.indexOf('--reason')
    const reason = i >= 0 ? args[i + 1] ?? '' : ''
    if (reason.trim().length < 12) {
      console.error('--update needs --reason "<what moved this number>" (12+ characters)')
      process.exit(1)
    }
    const res = mergeBaselines(config, rows, { allowRaise: args.includes('--allow-raise'), reason })
    if (!res.written) {
      console.error('Refused: a rise needs --allow-raise and a reason: ' + res.raised.map((r) => `${r.key} ${r.from}→${r.to}`).join(', '))
      process.exit(1)
    }
    writeFileSync(BASELINES, JSON.stringify(config, null, 2) + '\n')
    console.log(`block-baselines updated: ${res.changed.map((c) => `${c.key} ${c.from}→${c.to}`).join(', ') || 'nothing to change'}`)
    return
  }
  if (code) {
    for (const line of out) console.error('✗ ' + line)
    process.exit(code)
  }
  for (const r of rows) console.log(`✓ block baselines: ${r.key} ${r.current} (frozen ${r.baseline}${r.delta < 0 ? `; fell ${-r.delta}, run --update to freeze` : ''})`)
}

if (invokedDirectly(import.meta.url)) main()

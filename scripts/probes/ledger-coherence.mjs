#!/usr/bin/env node
// HYG-172 consequence probe: the one list and the ADR ledger point at things that exist.
//  1. No row cites a docs/ledger fragment that is not on disk (compaction re-points them).
//  2. No ADR in the base file is superseded by a linked clause without saying so (ADR-1730).
//  3. The DECISIONS.md theme index carries no stale "latest heading" status lines.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { loadBacklog, missingSupersedeBackLinks } from '../lib/ledger.mjs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

export function verifyLedgerCoherence(root = '.') {
  const doc = loadBacklog(root)
  const dangling = (doc.entries ?? [])
    .filter((r) => typeof r?.source?.file === 'string' && r.source.file.startsWith('docs/ledger/') && !existsSync(`${root}/${r.source.file}`))
    .map((r) => `${r.id} -> ${r.source.file}`)
  assert.deepEqual(dangling, [], `rows cite fragments that are gone: ${dangling.join(', ')}`)
  const base = readFileSync(`${root}/docs/DECISIONS.md`, 'utf8')
  const oneWay = missingSupersedeBackLinks(base).map(({ from, to }) => `ADR-${from} -> ADR-${to}`)
  assert.deepEqual(oneWay, [], `superseded ADRs that never name their successor: ${oneWay.join(', ')}`)
  const index = base.slice(0, base.indexOf('\n## ADR-001'))
  assert.ok(!/tree as of this index/.test(index), 'the theme index still records a "latest heading" status line')
  return 'ok: every row source exists, every linked supersession is two-way, the theme index routes without status'
}

if (invokedDirectly(import.meta.url)) console.log(verifyLedgerCoherence())

#!/usr/bin/env node
// LIVE-2294: multi-focus snapshots are queried only after an explicit schema-ready opt-in.
import assert from 'node:assert/strict'
import { practiceSupportLogColumns } from '../../lib/practice-support-evidence-read.ts'
const previous = process.env.PRACTICE_SUPPORT_EVIDENCE_ENABLED
try {
  delete process.env.PRACTICE_SUPPORT_EVIDENCE_ENABLED
  const legacy = practiceSupportLogColumns()
  assert.ok(legacy.includes('pillar_id, secondary_pillar_id, primary_pct'))
  assert.ok(!legacy.includes('support_pillar_ids'))
  assert.ok(!legacy.includes('support_evidence_version'))
  for (const value of ['', ' ', 'false', '0', 'off']) {
    process.env.PRACTICE_SUPPORT_EVIDENCE_ENABLED = value
    assert.equal(practiceSupportLogColumns(), legacy)
  }
  for (const value of ['1', 'true', ' ON ']) {
    process.env.PRACTICE_SUPPORT_EVIDENCE_ENABLED = value
    const expanded = practiceSupportLogColumns()
    assert.ok(expanded.includes('support_pillar_ids'))
    assert.ok(expanded.includes('support_evidence_version'))
    assert.ok(expanded.includes(legacy))
  }
} finally {
  if (previous === undefined) delete process.env.PRACTICE_SUPPORT_EVIDENCE_ENABLED
  else process.env.PRACTICE_SUPPORT_EVIDENCE_ENABLED = previous
}
console.log('Practice support reader keeps unapplied columns dark until explicit schema-ready opt-in')

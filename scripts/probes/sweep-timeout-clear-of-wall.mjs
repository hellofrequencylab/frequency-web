#!/usr/bin/env node
// HYG-219: the backlog sweep's vitest timeout is a hang detector, not its budget (the budget is CPU,
// LIVE-047 / ADR-1107). On 2026-11-02 the full --probes=all run read 88.8s of wall on CI against a
// 90s timeout and the next PR timed out on a green tree. This holds both real-tree cases at least
// 2x clear of the walls measured that day (88.8s sweep, 52.8s per-PR) so wall contention cannot
// become the gate again without someone lowering the number on purpose.
import { readFileSync } from 'node:fs'

const MEASURED_WALL_MS = { sweep: 88_829, perPr: 52_754 }
const src = readFileSync('scripts/backlog-contract.test.ts', 'utf8')
const bad = []
function timeoutOf(title) {
  const m = new RegExp(`it\\('${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', \\{ timeout: ([\\d_]+) \\}`).exec(src)
  return m ? Number(m[1].replace(/_/g, '')) : null
}
const sweep = timeoutOf('the full --probes=all sweep is green, and stays inside its cost budget')
const perPr = timeoutOf('satisfies both contracts')
if (sweep === null) bad.push('cannot find the sweep case timeout')
else if (sweep < MEASURED_WALL_MS.sweep * 2) bad.push(`sweep timeout ${sweep}ms is under 2x the ${MEASURED_WALL_MS.sweep}ms wall measured on CI`)
if (perPr === null) bad.push('cannot find the per-PR case timeout')
else if (perPr < MEASURED_WALL_MS.perPr * 2) bad.push(`per-PR timeout ${perPr}ms is under 2x the ${MEASURED_WALL_MS.perPr}ms wall measured on CI`)
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log(`sweep timeout ${sweep}ms and per-PR timeout ${perPr}ms are clear of the CI walls`)

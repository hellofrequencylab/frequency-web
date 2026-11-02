#!/usr/bin/env node
// HYG-219: the backlog sweep's vitest timeout is a hang detector, not its budget (the budget is CPU,
// LIVE-047 / ADR-1107). On 2026-11-02 the full --probes=all run read 88.8s of wall on CI against a
// 90s timeout and the next PR timed out on a green tree. This holds the sweep case at least 2x clear
// of the wall measured that day so wall time cannot become the gate again without someone lowering
// the number on purpose. The per-PR case ("satisfies both contracts") is not touched: it read 53s
// against its 90s and HYG-184's probe pins that literal.
import { readFileSync } from 'node:fs'

const MEASURED_SWEEP_WALL_MS = 88_829
const src = readFileSync('scripts/backlog-contract.test.ts', 'utf8')
const m = /it\('the full --probes=all sweep is green, and stays inside its cost budget', \{ timeout: ([\d_]+) \}/.exec(src)
if (!m) {
  console.error('cannot find the sweep case timeout in scripts/backlog-contract.test.ts')
  process.exit(1)
}
const sweep = Number(m[1].replace(/_/g, ''))
if (sweep < MEASURED_SWEEP_WALL_MS * 2) {
  console.error(`sweep timeout ${sweep}ms is under 2x the ${MEASURED_SWEEP_WALL_MS}ms wall measured on CI`)
  process.exit(1)
}
console.log(`sweep timeout ${sweep}ms is clear of the ${MEASURED_SWEEP_WALL_MS}ms CI wall`)

#!/usr/bin/env node
// `pnpm check:theme-conformance` (docs/THEME-COHESION.md section 5, LIVE-1865). The enforcing arm is a vitest file,
// because it renders the role blocks and reads the token contract (TypeScript behind a path alias), so this is only the
// local command: it runs that file and prints the friendly report. CI runs the same file in the required `test` job
// (scripts/guard-wiring.test.ts, VITEST_ENFORCED), so nothing here is a second copy of the check.
import { spawnSync } from 'node:child_process'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const TEST_FILE = 'scripts/theme-conformance.test.ts'
export const BASELINE_FILE = 'scripts/theme-conformance-baseline.json'

if (invokedDirectly(import.meta.url)) {
  const r = spawnSync('pnpm', ['vitest', 'run', TEST_FILE], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

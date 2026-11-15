import { spawnSync } from 'node:child_process'

// Exercise the real lead helper, closed registry, engagement recorder and GA transport.
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'lib/analytics/lead-google-chain.test.ts', '--maxWorkers=2',
], { cwd: process.cwd(), stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)

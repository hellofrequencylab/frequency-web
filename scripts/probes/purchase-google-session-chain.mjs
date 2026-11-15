import { spawnSync } from 'node:child_process'

// Exercise actual paid conversion, taxonomy, ledger, mirror and Google payload with isolated I/O.
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'lib/analytics/purchase-google-chain.test.ts', '--maxWorkers=2',
], { cwd: process.cwd(), stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)

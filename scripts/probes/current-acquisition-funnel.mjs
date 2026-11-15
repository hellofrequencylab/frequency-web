import { spawnSync } from 'node:child_process'

// The actual registry becomes the ordered SQL spec; retired member steps empty every later cohort.
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'lib/analytics/acquisition-funnel-coverage.test.ts', '--maxWorkers=2',
], { cwd: process.cwd(), stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)

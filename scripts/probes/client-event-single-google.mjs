// Exercise the real client/collector/tracker/provider chain with external boundary fixtures.
import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'lib/analytics/client-event-delivery.test.ts',
  '--maxWorkers=2',
], { cwd: process.cwd(), stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)

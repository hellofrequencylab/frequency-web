import { spawnSync } from 'node:child_process'

// Execute the actual receiver against observed empty-association metadata and negative bindings.
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'scripts/verify-migration-readiness.unassociated-run.test.ts',
  '--maxWorkers=2',
], { cwd: process.cwd(), stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)

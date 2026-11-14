import { spawnSync } from 'node:child_process'

// Exercise the actual gateway request and weekly server-action boundaries.
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'lib/ai/journey-support-review.test.ts',
  'app/(main)/journeys/[slug]/edit/support-week-coaching.test.tsx',
  '--maxWorkers=2',
], { cwd: process.cwd(), stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)

// SCAN-1176: runs the map-seam and timer runtime tests. Exits non-zero when any fail or go missing.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const files = [
  'components/maps/map-canvas-seam.test.tsx',
  'lib/nurture/runner.test.ts',
  'lib/seasons-go-live.test.ts',
  'lib/member-day-boundaries.test.ts',
]
const missing = files.filter((f) => !existsSync(f))
if (missing.length) {
  console.error(`missing: ${missing.join(', ')}`)
  process.exit(1)
}
const run = spawnSync('npx', ['vitest', 'run', ...files], { stdio: 'inherit' })
process.exit(run.status ?? 1)

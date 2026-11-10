// FH-007 probe: the Hunt graph validator and evaluator tests pass.
import { spawnSync } from 'node:child_process'
const r = spawnSync('pnpm', ['exec', 'vitest', 'run', 'lib/hunts/graph'], { stdio: 'ignore' })
process.exit(r.status === 0 ? 0 : 1)

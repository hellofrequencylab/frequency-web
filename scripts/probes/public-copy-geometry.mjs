import { spawnSync } from 'node:child_process'

// Focused renderer and actual pricing-callback consequences. The separate
// deployment browser matrix must still verify every public route and state.
const result = spawnSync('pnpm', [
  'exec', 'vitest', 'run',
  'components/frequency/site/public-copy-geometry-seams.test.tsx',
  'components/frequency/site/pages/pricing/pricing-illustration-sizing.test.ts',
  '--no-fsModuleCache',
], { stdio: 'inherit', timeout: 60_000 })
if (result.error || result.signal || result.status === null || result.status === 127) process.exit(79)
process.exit(result.status)

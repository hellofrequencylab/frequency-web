import { spawnSync } from 'node:child_process'

// Every test remains required. The backlog contract itself starts up to eight probe
// processes; competing with the other Vitest workers made its unchanged 90s ceiling
// measure contention (87.6s passing / 90.7s timeout on the same 1766-probe corpus).
// Run both partitions even if one fails, and retain either failure in the final status.
const partitions = [
  ['test', '--exclude', 'scripts/backlog-contract.test.ts'],
  ['test', 'scripts/backlog-contract.test.ts', '--maxWorkers=2'],
]
let failed = false
for (const args of partitions) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) failed = true
  // Cancellation is not a reason to start more work. A failed assertion, however,
  // must still let the other partition report its independent result.
  if (result.signal) {
    process.kill(process.pid, result.signal)
    break
  }
  if (result.error) break
}
process.exitCode = failed ? 1 : 0

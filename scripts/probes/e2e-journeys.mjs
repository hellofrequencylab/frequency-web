// The signed-in journey suite exists, keeps writes off production, and stays out of the default PR run.
import { existsSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const spec = existsSync('test/e2e/journeys.spec.ts') ? readFileSync('test/e2e/journeys.spec.ts', 'utf8') : ''
assert.ok(spec, 'test/e2e/journeys.spec.ts is missing')
for (const needle of ['@journey ', '@journey-write', 'PW_JOURNEY_WRITES', 'journeyWritesAllowed', 'Your look', 'Start with this kit']) {
  assert.ok(spec.includes(needle), `journeys.spec.ts no longer mentions ${needle}`)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
assert.match(pkg.scripts['test:e2e'], /@journey/, 'test:e2e must exclude @journey so the default PR run never writes')
assert.match(pkg.scripts['test:e2e:journeys'] ?? '', /@journey/, 'test:e2e:journeys is missing')

const wf = existsSync('.github/workflows/e2e-journeys.yml') ? readFileSync('.github/workflows/e2e-journeys.yml', 'utf8') : ''
assert.ok(wf, '.github/workflows/e2e-journeys.yml is missing')
assert.ok(/workflow_dispatch/.test(wf) && !/pull_request|schedule:/.test(wf), 'e2e-journeys.yml must be dispatch-only (every run is a paid build)')
assert.ok(/supabase start/.test(wf), 'e2e-journeys.yml must boot a local Supabase, never point writes at a hosted project')
console.log('ok')

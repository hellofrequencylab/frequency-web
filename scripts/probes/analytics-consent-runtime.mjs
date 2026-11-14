// Actual application-boundary checks. Fixtures never contact Google or a shared database.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const root = readFileSync('app/layout.tsx', 'utf8')
assert.ok(root.includes('<GoogleAnalytics />') && root.includes('<FirstPartyAnalyticsPolicy />'), 'Both configured Google and Google-inert first-party policy paths must remain mounted')
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'components/analytics/google-policy-bootstrap.test.tsx',
  'components/analytics/track-provider-consent.test.tsx',
  'components/analytics/consent-transitions.test.tsx',
  'lib/analytics/request-consent-runtime.test.ts',
  '--maxWorkers=2',
], { cwd: process.cwd(), stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)

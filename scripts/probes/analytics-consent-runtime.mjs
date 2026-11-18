// Actual application-boundary checks. Fixtures never contact Google or a shared database.
import { requireInSuite } from './in-suite.mjs'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const root = readFileSync('app/layout.tsx', 'utf8')
assert.ok(root.includes('<GoogleAnalytics />') && root.includes('<FirstPartyAnalyticsPolicy />'), 'Both configured Google and Google-inert first-party policy paths must remain mounted')
// HYG-242: the required `test` job runs these files on every pull request; ask, in-process, that they are still in that
// run with their cases instead of paying a second JSDOM vitest startup in the backlog sweep.
requireInSuite({
  'components/analytics/google-policy-bootstrap.test.tsx': 14,
  'components/analytics/track-provider-consent.test.tsx': 6,
  'components/analytics/consent-transitions.test.tsx': 5,
  'lib/analytics/request-consent-runtime.test.ts': 12,
})

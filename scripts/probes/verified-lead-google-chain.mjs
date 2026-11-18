// Exercise the real lead helper, closed registry, engagement recorder and GA transport.
// HYG-242: the required `test` job runs these files on every pull request. This probe asks, in-process, that they are
// still in that run with their cases, instead of paying a second vitest startup in the backlog sweep.
import { requireInSuite } from './in-suite.mjs'

requireInSuite({
  'lib/analytics/lead-google-chain.test.ts': 19
})

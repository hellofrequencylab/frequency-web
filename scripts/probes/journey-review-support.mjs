// Exercise the actual gateway request and weekly server-action boundaries.
// HYG-242: the required `test` job runs these files on every pull request. This probe asks, in-process, that they are
// still in that run with their cases, instead of paying a second vitest startup in the backlog sweep.
import { requireInSuite } from './in-suite.mjs'

requireInSuite({
  'lib/ai/journey-support-review.test.ts': 4,
  'app/(main)/journeys/[slug]/edit/support-week-coaching.test.tsx': 3
})

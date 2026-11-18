// Execute the actual receiver against observed empty-association metadata and negative bindings.
// HYG-242: the required `test` job runs these files on every pull request. This probe asks, in-process, that they are
// still in that run with their cases, instead of paying a second vitest startup in the backlog sweep.
import { requireInSuite } from './in-suite.mjs'

requireInSuite({
  'scripts/verify-migration-readiness.unassociated-run.test.ts': 6
})

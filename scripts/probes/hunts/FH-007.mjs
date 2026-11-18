// FH-007 probe: the Hunt graph validator and evaluator tests pass.
// HYG-242: the required `test` job runs lib/hunts/graph on every pull request; this asks, in-process, that those files
// are still in that run with their cases instead of spawning a second vitest run.
import { requireInSuite } from '../in-suite.mjs'
requireInSuite({
  'lib/hunts/graph/branches.test.ts': 22,
  'lib/hunts/graph/count-rules.test.ts': 23,
  'lib/hunts/graph/graph.test.ts': 30,
  'lib/hunts/graph/sponsor-milestone-math.test.ts': 3,
}, 'FH-007: the Hunt graph tests are in the required test run with their cases.')

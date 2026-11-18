#!/usr/bin/env node
// LIVE-2297: exercise the actual route's second-page read, metadata and out-of-range behavior.
// HYG-242: the required `test` job runs these files on every pull request. This probe asks, in-process, that they are
// still in that run with their cases, instead of paying a second vitest startup in the backlog sweep.
import { requireInSuite } from './in-suite.mjs'

requireInSuite({
  'app/discover/practices/pillar/[slug]/pagination.test.tsx': 7
})

#!/usr/bin/env node
// LIVE-2297: exercise the actual route's second-page read, metadata and out-of-range behavior.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'app/discover/practices/pillar/[slug]/pagination.test.tsx', '--maxWorkers=2'], { encoding: 'utf8', timeout: 60000 })
assert.equal(result.status, 0, `Pillar practice traversal regressed:\n${result.stdout}\n${result.stderr}`)
console.log('Public Pillar practice pages request real slices, expose totals, preserve public filters and identify later pages.')

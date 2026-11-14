#!/usr/bin/env node
// HYG-224: repository history guards require the checked-out main history.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
const checks = workflow.match(/(?:^|\n)  checks:\n([\s\S]*?)(?=\n  [A-Za-z0-9_-]+:\n|\n[^ \t])/m)?.[1]
assert.ok(checks, 'CI must keep a checks job for repository-history guards')

const checkout = checks.match(/      - uses: actions\/checkout@v7\n([\s\S]*?)(?=\n      - |\n$)/)?.[1] ?? ''
assert.match(
  checkout,
  /with:\n\s+fetch-depth: 0(?:\n|$)/,
  'The checks job must fetch complete main history before shipped-ids and migration guards run',
)

console.log('CI repository-history guards receive the full main history')

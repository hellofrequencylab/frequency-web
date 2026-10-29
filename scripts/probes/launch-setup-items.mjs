#!/usr/bin/env node
// LIVE-1916: the Setup list after Publish has one check-off item per Space tool, read from real records.
//
// Fails when the Setup item module is gone, when the post-publish list stops asking for the extended inventory, or when
// the coverage test that ties the Space tool catalog to Setup items is removed.
import { existsSync, readFileSync } from 'node:fs'

const bad = []
if (!existsSync('lib/launch/setup-items.ts')) bad.push('lib/launch/setup-items.ts is gone')
if (!/loadInventory\([^)]*true\)/.test(readFileSync('lib/launch/get-started-io.ts', 'utf8'))) bad.push('the post-publish list no longer reads the extended inventory')
if (!existsSync('lib/launch/setup-coverage.test.ts')) bad.push('the Space tool coverage test is gone')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('setup items: ok')

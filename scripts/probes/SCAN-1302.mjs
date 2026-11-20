#!/usr/bin/env node
// SCAN-1302: the platform's own root Space (/spaces/hq) titled itself "Frequency · Frequency" because its
// brand IS the site name and the root layout's `%s · Frequency` template appended it again (production
// crawl 2026-11-19). The consequence test renders the real metadata builder for the platform Space and an
// ordinary one and checks both titles.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const TEST = 'lib/spaces/profile-metadata-title.test.ts'
if (!existsSync(TEST)) { console.error(`SCAN-1302 FAIL: ${TEST} is missing`); process.exit(1) }
const run = spawnSync('pnpm', ['-s', 'vitest', 'run', TEST], { stdio: 'inherit' })
if (run.status !== 0) { console.error('SCAN-1302 FAIL: the platform Space title doubles the site name'); process.exit(1) }
console.log('SCAN-1302 ok: the platform Space titles do not repeat the site name; other Spaces keep the suffix')

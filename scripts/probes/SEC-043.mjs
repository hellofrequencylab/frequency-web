#!/usr/bin/env node
// SEC-043: a signed-out visitor's Vera turn was accounted on 'vera-chat', the members' $5/day key, so
// anonymous traffic could spend the members' Vera budget down to the deterministic fallback for the day.
// The consequence test drives the real turn with a stubbed model and checks both keys and the cap.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const TEST = 'lib/ai/vera/agent-claude-anon.test.ts'
if (!existsSync(TEST)) { console.error(`SEC-043 FAIL: ${TEST} is missing`); process.exit(1) }
const run = spawnSync('pnpm', ['-s', 'vitest', 'run', TEST], { stdio: 'inherit' })
if (run.status !== 0) { console.error("SEC-043 FAIL: a signed-out Vera turn still spends the members' budget"); process.exit(1) }
console.log('SEC-043 ok: signed-out Vera turns are accounted and capped on their own key')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// SCAN-1124: cron auth only waves through development and test; vitals is rate limited without
// resolving the caller.
const cron = readFileSync('lib/cron-auth.ts', 'utf8')
assert.match(cron, /NODE_ENV === 'development' \|\| process\.env\.NODE_ENV === 'test'/)
assert.doesNotMatch(cron, /NODE_ENV === 'production'/, 'cron auth must not key its fail-closed branch on production')
const vitals = readFileSync('app/api/vitals/route.ts', 'utf8')
assert.match(vitals, /rateLimitOk\('vitals'/)
assert.doesNotMatch(vitals, /clientIp/, 'the vitals sink must never resolve a caller')
console.log('Cron auth fails closed off development; vitals sink is throttled.')

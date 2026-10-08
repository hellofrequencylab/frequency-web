// Test-runner-free LIVE-786 wiring/financial safety probe; never calls money providers.
import { readFileSync, existsSync } from 'node:fs'
const source = path => readFileSync(path, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
const runner = source('lib/sites/domain-renewals.ts')
const route = source('app/api/cron/billing-renewals/route.ts')
const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
const checks = [
  ['bounded domain sweep', /export async function chargeDomainRenewals\(/.test(runner) && /opts\.exhausted\(\)/.test(runner)],
  ['period-bound conditional claim', /\.eq\('renews_at', row\.renews_at\)/.test(runner) && /\.is\('renewal_state', null\)/.test(runner)],
  ['registry expiration before payment', /await deps\.expiration\(row\.domain\)/.test(runner) && /Math\.abs\(expiration\.data\.expiresAt - due\) > DAY/.test(runner)],
  ['payment before provider submit', /deps\.charge\(row\)/.test(runner) && /claim\(deps, row, 'charged', 'renewing'\)/.test(runner)],
  ['ambiguous provider submissions preserved', /row\.renewal_state === 'renewing'/.test(runner) && /row\.renewal_state === 'charging'/.test(runner)],
  ['provider refund history reread', /client\.refunds\.list\(/.test(runner) && /prior\.status !== 'succeeded'/.test(runner)],
  ['one scheduled monitored handler', config.crons.some(job => job.path === '/api/cron/billing-renewals') && !config.crons.some(job => job.path === '/api/cron/domain-renewals') && !existsSync('app/api/cron/domain-renewals/route.ts')],
  ['domain work participates in monitored billing handler', /await chargeDomainRenewals\(/.test(route) && /withCronHeartbeat\('billing-renewals', handler\)/.test(route)],
  ['both failures reach shared heartbeat', /billingFailed === 0 && domains\.failed === 0 && domains\.attention === 0/.test(route) && /status: ok \? 200 : 500/.test(route)],
]
for (const [label, passes] of checks) if (!passes) { console.error(`LIVE-786: ${label}`); process.exitCode = 1 }

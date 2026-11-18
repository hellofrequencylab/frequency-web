#!/usr/bin/env node
// EMAIL-060: a campaign must not spend the whole daily send limit. On 2026-11-17 and 2026-11-18 the Founding Member
// campaign drained ~200 jobs at the UTC day's start, which was the Resend account's whole daily quota; every event
// reminder, Vera brief and Message Member send after it was accepted by the API and then failed with
// reached_daily_quota, so the queue marked it done and nobody got it. The drain now parks bulk email once the bulk
// share of EMAIL_DAILY_SEND_LIMIT (the limit minus a reserve) is spent for the UTC day, BEFORE the handler runs.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const src = readFileSync(new URL('lib/queue/outbox.ts', root), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fails = []

const budgetFn = /export function bulkDailyBudget\(dailyLimit: number \| null\): number \| null \{([\s\S]*?)\n\}/.exec(src)
if (!budgetFn) fails.push('bulkDailyBudget is gone (re-check this probe)')
else {
  const SHARE = Number(/TRANSACTIONAL_RESERVE_SHARE = ([\d.]+)/.exec(src)?.[1])
  const MIN = Number(/TRANSACTIONAL_RESERVE_MIN = (\d+)/.exec(src)?.[1])
  if (!(SHARE > 0) || !(MIN > 0)) fails.push('no transactional reserve (share and minimum must both be positive)')
}

const start = src.indexOf('export async function processQueue(')
const body = start < 0 ? '' : src.slice(start, src.indexOf('\nexport ', start + 10))
if (!body) fails.push('processQueue not found (re-check this probe)')
if (!/bulkDailyBudget\(configuredDailyLimit\(\)\)/.test(body)) fails.push('the drain does not read the bulk share of EMAIL_DAILY_SEND_LIMIT')
const park = body.search(/isBulkEmail\(job\) && bulkSpent >= bulkBudget/)
const call = body.indexOf('const handler = handlers[job.kind]')
if (park < 0 || call < 0 || park > call) fails.push('bulk email is not parked before the provider call once the bulk share is spent')
if (!/if \(isBulkEmail\(job\)\) bulkSpent\+\+/.test(body)) fails.push('finished bulk sends are not counted forward within the batch')
if (!/payload->>\$\{LANE_KEY\}/.test(src)) fails.push('the day count does not read the bulk lane')

if (fails.length) {
  console.error(`EMAIL-060 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('EMAIL-060 ok: bulk email stops at the limit minus a reserve each UTC day, so one-to-one mail still sends')

#!/usr/bin/env node
// JRN-012: the daily Journey prompt reaches every enrolled member past the 1000-row read cap and honours the
// member's in-app Practice setting (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const progress = read('lib/journeys/progress.ts')
const at = progress.indexOf('export async function listEnrolledMemberIds(')
const body = at < 0 ? '' : progress.slice(at, progress.indexOf('\nexport ', at + 10))
if (!/\.range\(/.test(body)) fails.push('listEnrolledMemberIds reads once with no range, so PostgREST max_rows (1000) silently drops members')
if (!/if \(error\) throw/.test(body)) fails.push('listEnrolledMemberIds reads a failed query as "nobody enrolled"')
const route = read('app/api/cron/journey-prompt/route.ts')
if (!/resolveSendGate\(profileId, 'inapp'/.test(route)) fails.push('the daily prompt ignores the member\'s in-app notification setting')

if (fails.length) {
  console.error(`JRN-012 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-012 ok: the daily prompt pages past the read cap and honours the in-app setting')

#!/usr/bin/env node
// JRN-002: a paid Journey never becomes free to join because its product is hidden, sold out, left as a
// draft by a failed re-price, or the price lookup fails (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const gate = read('lib/journeys/free-enrol-gate.ts')
if (/getJourneyOffer\(/.test(gate)) fails.push('the free door decides "paid" from getJourneyOffer, which reads only an active product and reads a failure as free')
if (!/getJourneySaleState\(/.test(gate)) fails.push('the free door does not read getJourneySaleState')
const paid = read('lib/journeys/paid.ts')
const at = paid.indexOf('export async function getJourneySaleState(')
const body = at < 0 ? '' : paid.slice(at, paid.indexOf('\nexport ', at + 10))
if (!body) fails.push('lib/journeys/paid.ts has no getJourneySaleState')
if (body && !/neq\('status', 'archived'\)/.test(body)) fails.push('getJourneySaleState does not count every non-archived product as sold')
if (body && !/if \(error\)[\s\S]{0,160}return 'paused'/.test(body)) fails.push('getJourneySaleState does not fail closed on a read error')
const sell = read('app/(main)/journeys/[slug]/sell-actions.ts')
if (!/if \(!product\) \{[\s\S]{0,400}previous/.test(sell)) fails.push('a failed re-price leaves the Journey with its old offer archived and nothing on sale')

if (fails.length) {
  console.error(`JRN-002 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-002 ok: the free door treats any live or paused product as paid, and a failed re-price restores the old offer')

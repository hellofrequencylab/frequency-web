#!/usr/bin/env node
// JRN-009: a Journey that is on sale, or that people paid for, cannot be deleted by its author or a curator;
// a delete cascades to the product and every enrolment (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const body = (src, sig) => {
  const at = src.indexOf(sig)
  if (at < 0) return ''
  const end = src.indexOf('\nexport ', at + 10)
  return src.slice(at, end < 0 ? undefined : end)
}
const fails = []
const blocker = body(read('lib/journeys/paid.ts'), 'export async function journeyDeleteBlocker(')
if (!blocker) fails.push('lib/journeys/paid.ts has no journeyDeleteBlocker')
if (blocker && !/order_id/.test(blocker)) fails.push('journeyDeleteBlocker does not look for paid enrolments')
if (blocker && !/neq\('status', 'archived'\)/.test(blocker)) fails.push('journeyDeleteBlocker does not look for a live or paused offer')
if (!/journeyDeleteBlocker\(planId\)/.test(body(read('app/(main)/journeys/actions.ts'), 'export async function deleteJourney('))) fails.push('the author delete (deleteJourney) removes a Journey people paid for')
if (!/journeyDeleteBlocker\(id\)/.test(body(read('app/(main)/admin/content/actions.ts'), 'export async function deleteJourneyPlanAction('))) fails.push('the curator delete removes a Journey people paid for')

if (fails.length) {
  console.error(`JRN-009 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-009 ok: Journeys on sale or paid for cannot be deleted')

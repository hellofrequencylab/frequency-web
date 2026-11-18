#!/usr/bin/env node
// JRN-003: a rejected or unpublished Journey leaves every list (member library, Run picker, library widget,
// the public /discover pages) right away, and a rejected one takes no new free joins (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fnBody = (src, sig) => {
  const at = src.indexOf(sig)
  if (at < 0) return ''
  const end = src.indexOf('\nexport ', at + 10)
  return src.slice(at, end < 0 ? undefined : end)
}
const fails = []
const plans = read('lib/journey-plans.ts')
if (!/neq\('status', 'rejected'\)/.test(fnBody(plans, 'export async function listPublicPlans('))) fails.push('listPublicPlans (member /journeys, library widget, Run picker) still lists rejected Journeys')
const actions = read('app/(main)/journeys/actions.ts')
for (const fn of ['adoptPlanAction', 'adoptJourney']) {
  if (!/status === 'rejected'/.test(fnBody(actions, `export async function ${fn}(`))) fails.push(`${fn} lets anyone join a rejected Journey`)
}
for (const fn of ['setJourneyVisibility', 'deleteJourney']) {
  if (!/revalidatePath\('\/discover\/journeys'/.test(fnBody(actions, `export async function ${fn}(`))) fails.push(`${fn} leaves the cached /discover/journeys pages up for an hour`)
}
const admin = read('app/(main)/admin/content/actions.ts')
for (const fn of ['setJourneyStatusAction', 'deleteJourneyPlanAction']) {
  if (!/revalidatePath\('\/discover\/journeys'/.test(fnBody(admin, `export async function ${fn}(`))) fails.push(`${fn} leaves the cached /discover/journeys pages up for an hour`)
}

if (fails.length) {
  console.error(`JRN-003 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-003 ok: rejected Journeys leave the member lists and take no new joins; status changes refresh /discover')

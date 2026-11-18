#!/usr/bin/env node
// JRN-008: duplicating or moving a Journey keeps its Space and member-tier gate consistent, never leaves a
// half-copied draft, and never moves a Journey that is on sale (Journey audit 2026-11-17).
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
const plans = read('lib/journey-plans.ts')
const dup = body(plans, 'export async function duplicatePlan(')
if (!/space_id: src\.space_id/.test(dup)) fails.push('duplicatePlan drops the source Space, so a Space copy lands in the root Space with another Space\'s tier gate')
if (!/if \(!copied\)/.test(dup)) fails.push('duplicatePlan ignores a failed block-tree copy and hands back a half-empty draft')
if (!/space_tier_id: null/.test(body(plans, 'export async function setPlanSpace('))) fails.push('setPlanSpace keeps the old Space\'s member-tier gate on a moved Journey')
const move = body(read('app/(main)/journeys/actions.ts'), 'export async function reassignJourneyOwner(')
if (!/commerce_products[\s\S]{0,200}neq\('status', 'archived'\)/.test(move)) fails.push('reassignJourneyOwner moves a Journey that is on sale (sales keep paying the old Space)')

if (fails.length) {
  console.error(`JRN-008 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-008 ok: duplicate and move keep the Space, tier gate and sales consistent')

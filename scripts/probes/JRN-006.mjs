#!/usr/bin/env node
// JRN-006: a Space manager who may edit the Space's Journeys gets the Journey admin rail and owner
// treatment for Runs, the same team-authoring rule as canEditJourney (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const src = read('lib/core/load-capabilities.ts')
const at = src.indexOf('export async function getJourneyCapabilities(')
const body = at < 0 ? '' : src.slice(at, src.indexOf('\nexport ', at + 10))
if (!body) fails.push('getJourneyCapabilities is gone')
if (!/viewerManagesScope,?\s*\}\)/.test(body)) fails.push('getJourneyCapabilities never passes viewerManagesScope, so Space managers get no journey.editSettings')
if (!/getSpaceCapabilities\(/.test(body)) fails.push('getJourneyCapabilities does not ask the owning Space who manages it')
if (!/type !== 'root'/.test(body)) fails.push('getJourneyCapabilities would treat managing the root Space as managing every personal Journey')

if (fails.length) {
  console.error(`JRN-006 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-006 ok: Space managers get journey.editSettings on their Space\'s Journeys')

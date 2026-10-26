#!/usr/bin/env node
// LIVE-1361 (ADR-1882): a niche starts a Space's tools from an existing capability bundle.
//
// Fails when the niche manifest loses a niche, when Space creation stops starting from the niche, or when
// Menu and features stops offering the Starting setup card or its guarded server action.
import { readFileSync } from 'node:fs'

const bad = []
const read = (f) => readFileSync(f, 'utf8')
const defaults = read('lib/spaces/niche-defaults.ts')
for (const niche of ['coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks']) {
  if (!new RegExp(`\\b${niche}: \\{ label:`).test(defaults)) bad.push(`niche-defaults.ts lost the ${niche} row`)
}
if (!read('lib/spaces/provision.ts').includes('startSpaceFromNiche(spaceId, input.niche)')) bad.push('Space creation no longer starts from the niche')
const actions = read('app/(main)/spaces/[slug]/manage/modules/actions.ts')
if (!actions.includes('export async function chooseSpaceNiche') || !actions.includes('isUntouchedSetup(')) bad.push('chooseSpaceNiche lost its untouched-Space guard')
if (!read('app/(main)/spaces/[slug]/manage/modules/page.tsx').includes('<StartingSetup')) bad.push('Menu and features no longer shows the Starting setup card')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('niche defaults: manifest, creation and the Starting setup card are wired')

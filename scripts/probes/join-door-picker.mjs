#!/usr/bin/env node
// LIVE-1140 probe: the Frequency /join first question is built from the six doors, each mapped to an existing persona.
import { readFileSync } from 'node:fs'

const personas = readFileSync('lib/onboarding/personas.ts', 'utf8')
const induction = readFileSync('app/join/(induction)/induction.tsx', 'utf8')
const bad = []
const slugs = ['coaches-and-healers', 'studios', 'event-hosts', 'venues', 'nonprofits', 'networks']
for (const s of slugs) if (!personas.includes(`slug: '${s}'`)) bad.push(`DOOR_CHOICES is missing ${s}`)
if (!/DOOR_CHOICES\.map/.test(induction)) bad.push('the induction no longer builds its first-question cards from DOOR_CHOICES')
if (bad.length) {
  console.error('LIVE-1140 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1140: /join asks with the six doors')

#!/usr/bin/env node
// The launch form opens filled from what the person already has. lib/launch/known.test.ts pins the rules; this reads
// the wiring: a saved Space fills from its tagline, about and domain and then the owner's profile, and a person with
// nothing saved gets their own profile (name, bio, website) in the form.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const fio = read('lib/launch/flow-io.ts')
const page = read('app/(main)/launch/step/spotlight/page.tsx')
const known = read('lib/launch/known.ts')
const io = read('lib/launch/known-io.ts')

if (!/prefillAnswers\(saved/.test(fio) || !/loadKnownProfile\(space\.ownerProfileId\)/.test(fio)) bad.push('a picked Space does not fill from its domain and its owner’s profile')
if (!/loadKnownProfile\(profileId\)/.test(page) || !/prefillAnswers\(null, null, known\)/.test(page)) bad.push('a person with nothing saved does not get their own profile in the form')
if (!/profile\?\.bio/.test(known) || !/profile\?\.website/.test(known)) bad.push('the profile bio and website are not fallbacks')
if (!/\.eq\('id', profileId\)/.test(io)) bad.push('the profile read is not limited to the person’s own row')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the launch form fills from the Space, then the profile')

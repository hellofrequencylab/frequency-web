#!/usr/bin/env node
// The launch starts from what the person already has. lib/launch/space-choice.test.ts pins the choice rules and the
// merge that keeps an arranged Spotlight's blocks; this reads the wiring: the page asks which of their own Spaces it is
// for before it asks for a new Spotlight, the pick attaches the Space to the launch instead of making a second one, a
// Space whose Spotlight is live counts as done, the form opens filled from the Space's own words, and saving never
// replaces blocks the person arranged.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const page = read('app/(main)/launch/step/spotlight/page.tsx')
const flow = read('components/launch/launch-flow.tsx')
const actions = read('lib/launch/actions.ts')
const io = read('lib/launch/spotlight-io.ts')
const fio = read('lib/launch/flow-io.ts')
const step = read('lib/launch/spotlight-step.ts')
const spaces = read('lib/launch/spaces-io.ts')

if (!/listOwnedSpaces/.test(page) || !/choices=\{choices\}/.test(page)) bad.push('the launch page does not ask which Space it is for')
if (!/chooseSpaceFormAction/.test(flow)) bad.push('the page has no way to pick a Space')
if (!/store\.attachSpace\(launch, choice\.id\)/.test(actions)) bad.push('picking a Space does not attach it to the launch')
if (!/choice\.spotlightLive[\s\S]{0,200}markStepPublished\(launch, 'spotlight'/.test(actions)) bad.push('a Space with a live Spotlight does not count as that step done')
if (!/parseSpaceChoice\(formData\.get\('space'\), spaces\)/.test(actions)) bad.push('a Space that is not the person’s own can be picked')
if (!/owner_profile_id', profileId\)/.test(spaces)) bad.push('the list of Spaces is not limited to the ones the person owns')
if (!/space\.tagline/.test(fio)) bad.push('the form does not open filled from what the Space already says')
if (!/mergeSpotlightLayout/.test(step) || !/hasNativeNodeStorage/.test(io)) bad.push('saving can replace blocks the person arranged')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the launch asks which Space it is for, fills from it, and saves back without removing what is there')

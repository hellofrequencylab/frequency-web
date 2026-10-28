#!/usr/bin/env node
// VLS-02: the nine launch steps, their order for every niche, and what counts as done.
//
// Fails when creating a Circle, an event or an offer stops flipping its step's done check without the launch
// UI, when a required step (1, 2, 4, 8) becomes skippable or can drop out for a niche, or when the order for a
// niche changes between two reads. Runs the real modules under node.
import { isSkippable, orderedLaunchSteps, LAUNCH_STEP_IDS } from '../../lib/launch/steps.ts'
import { launchDone, isLaunched } from '../../lib/launch/done-checks.ts'

const NICHES = ['coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks', 'general', 'creators', 'schools', 'clubs', 'faith', 'wellness', 'markets']
const empty = { preferences: {}, tagline: null, about: null, eventCount: 0, circleCount: 0, journeyCount: 0, contactCount: 0, payoutsReady: false }
const bad = []

for (const id of ['spotlight', 'space', 'website', 'people']) if (isSkippable(id)) bad.push(`${id} can be skipped`)
for (const id of ['offer', 'event', 'circle', 'journey', 'paid']) if (!isSkippable(id)) bad.push(`${id} cannot be skipped`)
if (LAUNCH_STEP_IDS.length !== 9) bad.push('there are not nine steps')

for (const niche of NICHES) {
  const a = orderedLaunchSteps(niche).map((s) => s.id).join()
  if (a !== orderedLaunchSteps(niche).map((s) => s.id).join()) bad.push(`${niche}: order is not stable`)
  for (const id of ['spotlight', 'space', 'website', 'people']) if (!a.split(',').includes(id)) bad.push(`${niche}: ${id} is missing`)
}

const flips = [
  ['event', { eventCount: 1 }],
  ['circle', { circleCount: 1 }],
  ['offer', { preferences: { profileData: { offerings: [{ title: 'Private session' }] } } }],
]
for (const [step, rows] of flips) {
  if (launchDone(empty)[step]) bad.push(`${step} is done on an empty Space`)
  if (!launchDone({ ...empty, ...rows })[step]) bad.push(`${step} does not flip when the thing exists`)
}
if (isLaunched(launchDone(empty))) bad.push('an empty Space counts as launched')

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Nine launch steps in a stable order for all 13 niches, required steps never skippable, and done is read from the rows.')

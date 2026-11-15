#!/usr/bin/env node
// LIVE-2286: exercise the same seed, draft and hold decisions as the nine hero choices. No database or runner.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
const { buildNicheChoices, resolveNicheSeed } = await import('../../lib/create-space/niche-choices.ts')
const { emptyDraft, parseDraft, serializeDraft, startingModeFor } = await import('../../lib/create-space/builder.ts')
const { chooseDraftNiche, goalsFromNicheOffer } = await import('../../lib/create-space/niche-draft.ts')
const { parseWizardResume } = await import('../../lib/launch/wizard-resume.ts')
const { parsePendingLaunch, serializePendingLaunch } = await import('../../lib/launch/pending.ts')
const doors = [
  ['coaches-and-healers', 'coaches', 'business:packages'], ['studios', 'studios', 'business:membership'],
  ['event-hosts', 'hosts', 'business:ticketed'], ['venues', 'venues', 'business:ticketed'],
  ['nonprofits', 'nonprofits', 'nonprofit:donations'], ['networks', 'networks', 'business:membership'],
  ['local-businesses', 'general', 'business:service'], ['clubs-and-groups', 'clubs', 'business:membership'],
  ['spiritual-community', 'faith', 'nonprofit:donations'],
]
const choices = buildNicheChoices((slug) => { const door = doors.find(([s]) => s === slug); return door ? { niche: door[1] } : undefined }, Object.fromEntries(doors.map(([, niche, mode]) => [niche, { mode: 'direct', url: `/spaces/new?mode=${mode}` }])))
assert.equal(choices.length, 9)
for (const [slug, niche, mode] of doors) {
  assert.equal(resolveNicheSeed(choices, slug).niche, niche)
  assert.equal(resolveNicheSeed(choices, niche).mode, mode)
}
assert.equal(resolveNicheSeed(choices, 'coaches', 'business:membership').mode, 'business:membership')
const picked = chooseDraftNiche(emptyDraft('new-world', true), choices, 'coaches')
const draft = { ...picked, offer: 'I host events', goals: goalsFromNicheOffer(picked, 'I host events') }
assert.equal(draft.niche, 'coaches', 'Typed goals must not replace a selected niche')
assert.deepEqual(draft.goals, ['bookings', 'events'])
assert.equal(startingModeFor(draft.goals, draft.modeHint).label, 'Packages')
const restored = parseDraft(serializeDraft(draft), null)
assert.equal(restored.modeHint, 'business:packages', 'The exact mode must survive a draft round-trip')
const resume = parseWizardResume({ version: 1, phase: 'builder', cursor: 1, theme: draft.kit, accentAt: 0, niche: draft.niche, goals: draft.goals, modeHint: draft.modeHint, timedEntry: false, draft, leadToken: null })
const now = new Date('2026-11-14T12:00:00Z')
const held = parsePendingLaunch(serializePendingLaunch({ niche: draft.niche, intents: draft.goals, answers: {}, resume }, now), now)
assert.equal(held.resume.draft, null, 'Private draft text must stay out of the cookie')
assert.equal(held.resume.modeHint, 'business:packages', 'A draft-free hold must retain the exact mode')
assert.equal(resolveNicheSeed(choices, 'coaches-and-healers/extra'), null)
console.log('Nine niche seeds: canonical aliases, exact modes, additive goals and private-draft-free resume continuity pass')

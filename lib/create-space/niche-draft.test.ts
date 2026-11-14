import { expect, it } from 'vitest'
import { emptyDraft, parseDraft, serializeDraft, startingModeFor } from './builder'
import { doorArrival } from './door'
import { chooseDraftNiche, goalsFromNicheOffer, nicheArrival } from './niche-draft'
import { getOnboardingNicheChoices } from './niche-choices.server'
import { parseWizardResume } from '@/lib/launch/wizard-resume'
import { parsePendingLaunch, serializePendingLaunch } from '@/lib/launch/pending'

const choices = getOnboardingNicheChoices()
it('preselects a public door alias while retaining an explicit valid URL mode and extra intents', () => {
  const params = new URLSearchParams('niche=coaches-and-healers&mode=business:membership&intents=email')
  expect(nicheArrival(doorArrival((key) => params.get(key)), choices, params.get('niche'), params.get('mode'))).toMatchObject({ niche: 'coaches', modeHint: 'business:membership', goals: ['classes', 'email'] })
})
it('keeps an exact coach package mode and selected niche when the sentence adds event goals', () => {
  const picked = chooseDraftNiche(emptyDraft('new-world', true), choices, 'coaches')
  const draft = { ...picked, offer: 'I host events and workshops', goals: goalsFromNicheOffer(picked, 'I host events and workshops') }
  expect(draft).toMatchObject({ niche: 'coaches', modeHint: 'business:packages', goals: ['bookings', 'events'] })
  expect(startingModeFor(draft.goals, draft.modeHint).label).toBe('Packages')
  expect(parseDraft(serializeDraft(draft), null)).toMatchObject({ niche: 'coaches', modeHint: 'business:packages', goals: ['bookings', 'events'] })
})
it('replaces only a prior chip seed when a different niche is chosen', () => {
  const previous = { ...chooseDraftNiche(emptyDraft('new-world', true), choices, 'faith'), goals: ['donations', 'email'] as const }
  const changed = chooseDraftNiche({ ...previous, goals: [...previous.goals] }, choices, 'studios')
  expect(changed).toMatchObject({ niche: 'studios', modeHint: 'business:membership', goals: ['classes', 'email'] })
})
it('retains the chosen mode through draft-free anonymous hold and canonical resume', () => {
  const draft = chooseDraftNiche(emptyDraft('new-world', true), choices, 'faith')
  const resume = parseWizardResume({ version: 1, phase: 'builder', cursor: 1, theme: draft.kit, accentAt: 0, niche: draft.niche, goals: draft.goals, modeHint: draft.modeHint, timedEntry: false, draft, leadToken: null })!
  const now = new Date('2026-11-14T12:00:00Z')
  const held = parsePendingLaunch(serializePendingLaunch({ niche: draft.niche, intents: draft.goals, answers: {}, resume }, now), now)!
  expect(held.resume).toMatchObject({ niche: 'faith', modeHint: 'nonprofit:donations', goals: ['donations'], draft: null })
  expect(parseWizardResume({ ...held.resume, draft })).toMatchObject({ modeHint: 'nonprofit:donations', draft: expect.objectContaining({ modeHint: 'nonprofit:donations' }) })
})
it('drops invalid mode metadata and leaves legacy draft serialization shape intact', () => {
  const draft = emptyDraft('new-world', true)
  expect(parseDraft(serializeDraft({ ...draft, modeHint: 'business:nonexistent' }), null)).toEqual(draft)
  expect(parseDraft(serializeDraft(draft), null)).not.toHaveProperty('modeHint')
})
it('rejects conflicting registered draft and resume modes at the full owner boundary', () => {
  const draft = chooseDraftNiche(emptyDraft('new-world', true), choices, 'faith')
  expect(parseWizardResume({ version: 1, phase: 'builder', cursor: 1, theme: draft.kit, accentAt: 0, niche: draft.niche, goals: draft.goals, modeHint: 'business:packages', timedEntry: false, draft, leadToken: null })).toBeNull()
})
it('treats a niche-only choice as resumable progress before any name or sentence is typed', async () => {
  const { hasProgress } = await import('./builder')
  expect(hasProgress(chooseDraftNiche(emptyDraft('new-world', false), choices, 'faith'))).toBe(true)
})

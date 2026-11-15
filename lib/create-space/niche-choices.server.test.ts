import { expect, it } from 'vitest'
import { getOnboardingNicheChoices, resolveOnboardingNicheSeed } from './niche-choices.server'

it('passes nine bounded serializable choices without including marketing or pricing content', () => {
  const choices = getOnboardingNicheChoices()
  expect(choices).toHaveLength(9)
  expect(JSON.parse(JSON.stringify(choices))).toEqual(choices)
  expect(choices.every((choice) => Object.keys(choice).sort().join(',') === 'goals,label,mode,niche,slug')).toBe(true)
})
it('re-derives the selected door mode and supports validated legacy explicit mode hints', () => {
  expect(resolveOnboardingNicheSeed('spiritual-community')).toEqual({ niche: 'faith', mode: 'nonprofit:donations', goals: ['donations'] })
  expect(resolveOnboardingNicheSeed('coaches-and-healers', 'business:membership')).toEqual({ niche: 'coaches', mode: 'business:membership', goals: ['classes'] })
  expect(resolveOnboardingNicheSeed('unknown', 'business:membership')).toBeNull()
})

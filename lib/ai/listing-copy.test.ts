import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ on: true, over: false, response: '', calls: vi.fn() }))
vi.mock('./client', () => ({ aiEnabled: () => state.on }))
vi.mock('./usage', () => ({ featureOverBudget: async () => state.over }))
vi.mock('./rate-limit', () => ({ aiRateLimited: async () => false }))
vi.mock('./complete', () => ({ completeText: async (input: unknown) => { state.calls(input); return { text: state.response } } }))
import { draftListingCopy, parseCopy } from './listing-copy'
import { composeCircleSection } from './circle-compose'
import { planCircleEdit } from './circle-edit'
import { parseWritingQuestions, WRITING_QUESTIONS } from './writing-questions'
beforeEach(() => { state.on = true; state.over = false; state.calls.mockClear(); state.response = '{"questionIds":["offering"]}' })
describe('human-authored listing and Circle coaching', () => {
  it('refuses invented title/description and extra model fields', () => {
    expect(parseCopy('{"title":"Invented","description":"A promise"}')).toBeNull()
    expect(parseCopy('{"questions":["Who is it for?"],"title":"Invented"}')).toBeNull()
    expect(parseWritingQuestions('{"questions":["Here is your copy."]}')).toBeNull()
    expect(parseWritingQuestions('{"questions":[12]}')).toBeNull()
  })
  it('returns only questions alongside empty legacy content slots', async () => {
    expect(await draftListingCopy({ kind: 'physical', seed: 'My exact title' })).toEqual({ title: '', description: '', questions: ['What will someone receive?'] })
    expect(parseCopy(state.response)).toEqual({ title: '', description: '', questions: ['What will someone receive?'] })
  })
  it('falls back to useful questions rather than deterministic fabricated copy', async () => {
    state.response = '{"title":"Invented","description":"Made up"}'
    expect(await draftListingCopy({ kind: 'service' })).toEqual({ title: '', description: '', questions: WRITING_QUESTIONS })
  })
  it.each(['off', 'budget'])('keeps coaching useful when %s and never calls provider', async mode => {
    state.on = mode !== 'off'; state.over = mode === 'budget'
    expect((await draftListingCopy({ kind: 'physical' })).questions).toEqual(WRITING_QUESTIONS)
    expect(state.calls).not.toHaveBeenCalled()
  })
  it('Circle section and edit return no writable patch keys', async () => {
    expect(await composeCircleSection({ section: 'card', context: { name: 'Human name', primaryPillar: null }, profileId: 'owner' })).toEqual({ questions: ['What will someone receive?'] })
    expect(await planCircleEdit({ request: 'Improve my explanation', circle: { name: 'Human name' }, profileId: 'owner' })).toEqual({ questions: ['What will someone receive?'] })
  })
})

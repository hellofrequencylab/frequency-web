import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ complete: vi.fn(), enabled: true }))
vi.mock('./client', () => ({ aiEnabled: () => m.enabled }))
vi.mock('./usage', () => ({ featureOverBudget: async () => false }))
vi.mock('./rate-limit', () => ({ aiRateLimited: async () => false }))
vi.mock('./complete', () => ({ completeRaw: m.complete }))
import { draftJourneySpark, JOURNEY_SPARK } from './journey-spark'
import { planJourneyEdits } from './journey-edit'
import { draftJourneyComposition } from './journey-composition'
import { draftSlotCoaching } from './journey-slot-coaching'
beforeEach(() => { vi.clearAllMocks(); m.enabled = true })
it('drops adversarial names, intros, arcs, steps and edit operations across all model doors', async () => {
  const attack = { questions: ['What comes first for participants?'], title: 'Attack', promise: 'Attack', overview: 'Attack', arc: [{ title: 'Attack', focus: 'Attack' }], edits: [{ op: 'remove', id: 'existing' }], practices: [{ mode: 'create', title: 'Attack', body: 'Attack' }], prompt: 'Attack', settings: { daily_minutes: 15 }, meeting: { schedule: 'Sunday 7pm' } }
  m.complete.mockImplementation(async request => ({ content: [{ type: 'tool_use', name: request.toolChoice.name, input: attack }] }))
  const spark = await draftJourneySpark({ who: 'My audience', topic: 'My topic', outcome: 'My goal', weeks: 4, pace: 'light', sourceText: 'Sunday 7pm; 15 minutes daily', profileId: 'author' })
  expect(spark).toMatchObject({ questions: attack.questions, title: '', promise: '', overview: '', arc: [], settings: { dailyMinutes: 15 }, meeting: { schedule: 'Sunday 7pm' } })
  const original = { title: 'Mine', subtitle: 'Mine', intro: '  My introduction.\n\nMore words!  ', phases: [] }
  expect(await planJourneyEdits({ request: 'Rewrite', journey: original, profileId: 'author' })).toEqual({ questions: attack.questions })
  expect(m.complete.mock.calls[1][0].messages[0].content).toContain(JSON.stringify(original.intro))
  expect(await draftJourneyComposition({ description: 'Mine', library: { mind: [], body: [], spirit: [], expression: [] }, profileId: 'author' })).toEqual({ questions: attack.questions })
  expect(await draftSlotCoaching({ journeyTitle: 'Mine', practiceTitle: 'Mine', profileId: 'author' })).toEqual({ questions: attack.questions })
  expect(m.complete.mock.calls.map(([r]) => [r.accounting.feature, r.tier])).toEqual([['journey-spark', 'sonnet'], ['journey-edit', 'opus'], ['journey-composition', 'opus'], ['journey-slot-coaching', 'haiku']])
})
it('rejects malformed prose-shaped replies and makes no provider call when disabled', async () => {
  expect(JOURNEY_SPARK.coerce({ title: 'Attack', overview: 'Attack' }, 4)).toBeNull()
  m.enabled = false
  expect(await planJourneyEdits({ request: 'Help', journey: { title: '', subtitle: '', intro: '', phases: [] } })).toBeNull()
  expect(m.complete).not.toHaveBeenCalled()
})
it('does not infer settings or meeting facts from brief answers without a source document', async () => {
  m.complete.mockResolvedValue({ content: [{ type: 'tool_use', name: 'draft_journey_spark', input: { questions: ['Who is this for?'], settings: { daily_minutes: 42, category: 'Invented' }, meeting: { schedule: 'Invented schedule' } } }] })
  const result = await draftJourneySpark({ who: '', topic: 'My idea', outcome: '', weeks: 4, pace: 'light' })
  expect(result?.settings).toEqual({ difficulty: null, category: null, tags: [], dailyMinutes: null })
  expect(result?.meeting).toEqual({ format: null, schedule: null, timezone: null, location: null, link: null })
})

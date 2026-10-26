import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ complete: vi.fn(), enabled: true }))
vi.mock('./client', () => ({ aiEnabled: () => m.enabled }))
vi.mock('./usage', () => ({ featureOverBudget: async () => false }))
vi.mock('./rate-limit', () => ({ aiRateLimited: async () => false }))
vi.mock('./complete', () => ({ completeRaw: m.complete }))
import { draftPracticeSpark, personalizePractice, PRACTICE_SPARK } from './practice-spark'
import { planPracticeEdits } from './practice-edit'
beforeEach(() => { vi.clearAllMocks(); m.enabled = true; m.complete.mockResolvedValue({ content: [{ type: 'tool_use', name: 'coach_author', input: { questions: ['Who is this for?'], title: 'Generated title', body: 'Generated guide', steps: ['Generated step'] } }] }) })
describe('Practice model outputs cannot become authoring fields', () => {
  it('returns only separate questions across spark, claim and edit with central accounting', async () => {
    const original = '  First line.\n\nSecond line!  '
    expect(await draftPracticeSpark({ who: 'Guests', act: 'Sit', outcome: 'Rest', pace: 'light', cadence: 'daily', sourceText: original, profileId: 'author' })).toEqual({ questions: ['Who is this for?'] })
    expect(JSON.parse(m.complete.mock.calls[0][0].messages[0].content).authoredDraft).toBe(original)
    expect(m.complete.mock.calls[0][0].accounting).toMatchObject({ feature: 'practice-spark', profileId: 'author' })
    expect(await personalizePractice({ template: { title: 'Original', summary: null, body: original, cadence: null }, goal: 'Rest', schedule: '', profileId: 'author' })).toEqual({ questions: ['Who is this for?'] })
    expect(await planPracticeEdits({ request: 'Rewrite', practice: { title: 'Mine', summary: '', description: '', body: original, cadence: 'Daily' }, profileId: 'author' })).toEqual({ questions: ['Who is this for?'] })
  })
  it('rejects plain copy, invalid questions and unbounded output', () => {
    expect(PRACTICE_SPARK.coerce({ title: 'Draft', body: 'Replace it' }, undefined)).toBeNull()
    expect(PRACTICE_SPARK.coerce({ questions: ['Join our practice.', 'x'.repeat(281), 'What changed?\nPublish this.', 'Who is this for?', 'Who is this for?'] }, undefined)).toEqual({ questions: ['Who is this for?'] })
  })
  it('does not call the model when disabled', async () => {
    m.enabled = false
    expect(await draftPracticeSpark({ who: '', act: 'Mine', outcome: '', cadence: 'daily', pace: 'light' })).toBeNull()
    expect(m.complete).not.toHaveBeenCalled()
  })
})

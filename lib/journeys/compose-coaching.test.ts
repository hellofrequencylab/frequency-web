import { expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ draft: vi.fn(), admin: vi.fn(), pillars: vi.fn() }))
vi.mock('@/lib/ai/journey-composition', () => ({ draftJourneyComposition: m.draft }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@/lib/pillars', () => ({ getPillars: m.pillars }))
import { composeIntoPhase } from './compose'
it('actual composition boundary never reads/writes rows or returns model prose, including fallback', async () => {
  const from = vi.fn(() => { throw Error('Coaching may not read or write a table') })
  const input = { admin: { from } as never, planId: 'mine', phaseId: 'week', description: 'My plan', profileId: 'author' }
  m.draft.mockResolvedValue({ questions: ['What is this week for?'], title: 'Attack', practices: [{ mode: 'create', title: 'Attack', body: 'Attack' }], extraCredit: { title: 'Attack', body: 'Attack' } })
  expect(await composeIntoPhase(input)).toEqual({ aiUsed: true, title: null, questions: ['What is this week for?'] })
  m.draft.mockResolvedValue(null)
  expect(await composeIntoPhase(input)).toMatchObject({ aiUsed: false, title: null, questions: expect.any(Array) })
  expect(from).not.toHaveBeenCalled()
  expect(m.admin).not.toHaveBeenCalled()
  expect(m.pillars).not.toHaveBeenCalled()
})

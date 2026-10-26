import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ user: true, host: 'owner', save: vi.fn(), coach: vi.fn(async () => ({ name: 'Invented name', card: 'Invented prose', questions: ['Who is this for?'] })) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: 'auth-owner' } : null } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'owner', is_demo: false } }) }) }) }) }) }))
vi.mock('@/lib/circles/draft', () => ({ getCircleDraft: async () => ({ id: 'circle-a', name: 'Human name', about: 'Human prose', primaryPillar: null, hostId: state.host }), saveCircleDraft: state.save, createBlankCircleDraft: vi.fn() }))
vi.mock('@/lib/ai/circle-compose', () => ({ composeCircleSection: state.coach }))
vi.mock('@/lib/ai/circle-edit', () => ({ planCircleEdit: state.coach }))
vi.mock('@/lib/ai/circle-spark', () => ({ draftCircleSpark: vi.fn() }))
vi.mock('@/lib/ai/vera/create-entity', () => ({ proposeAndConfirmCreate: vi.fn() }))
vi.mock('@/lib/core/load-capabilities', () => ({ assertCanCreate: vi.fn() }))
vi.mock('@/lib/journeys/extract-text', () => ({ extractOverviewText: vi.fn() }))
import { composeSectionAction, editDraftAction } from './builder-actions'
beforeEach(() => { state.user = true; state.host = 'owner'; state.save.mockClear(); state.coach.mockClear() })
it('server strips invented section fields and never persists a generator patch', async () => {
  expect(await composeSectionAction({ circleId: 'circle-a', section: 'card' })).toEqual({ questions: ['Who is this for?'] })
  const result = await editDraftAction({ circleId: 'circle-a', request: 'Think through this' })
  expect(result?.draft.name).toBe('Human name'); expect(result?.draft.about).toBe('Human prose')
  expect(result?.questions).toEqual(['Who is this for?']); expect(state.save).not.toHaveBeenCalled()
})
it('foreign host and signed-out calls fail before generator reads or writes', async () => {
  state.host = 'other'
  await expect(composeSectionAction({ circleId: 'circle-a', section: 'card' })).rejects.toThrow('Only the Host')
  state.user = false
  await expect(editDraftAction({ circleId: 'circle-a', request: 'x' })).rejects.toThrow('sign in')
  expect(state.coach).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled()
})

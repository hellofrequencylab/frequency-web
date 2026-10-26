import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySpaceCoachProfile } from '@/lib/spaces/coach-profile'
const m = vi.hoisted(() => ({ actor: vi.fn(), get: vi.fn(), caps: vi.fn(), grounding: vi.fn(), bio: vi.fn(), tagline: vi.fn(), coach: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: m.actor }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: m.get }))
vi.mock('@/lib/spaces/private-state', () => ({ loadSpaceCoachProfile: m.coach }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: m.caps }))
vi.mock('@/lib/ai/space-grounding', () => ({ loadSpaceGrounding: m.grounding }))
vi.mock('@/lib/ai/space-copilot', () => ({ draftSpaceBio: m.bio, suggestTagline: m.tagline }))
import { draftSpaceBioAction, suggestTaglineAction } from './copilot-actions'
beforeEach(() => {
  vi.clearAllMocks()
  m.actor.mockResolvedValue('editor-A')
  m.get.mockImplementation(async (id: string) => ({ id, name: id, type: 'business', preferences: { coachProfile: { ...emptySpaceCoachProfile(), goals: `Goals for ${id}` }, privateNotes: 'Never supplied' } }))
  m.caps.mockImplementation(async (space: { id: string }) => ({ canEditProfile: space.id === 'space-A' }))
  m.coach.mockImplementation(async (id: string) => ({ available: true, profile: { ...emptySpaceCoachProfile(), goals: `Private goals for ${id}` } }))
  m.grounding.mockResolvedValue({ about: 'Owner-written story', offerings: [] })
  m.bio.mockResolvedValue('Who would you like to welcome?')
  m.tagline.mockResolvedValue('Which words sound like you?')
})
describe('Space coaching action tenant boundary', () => {
  it('uses the authorized Space own declared context, never unrelated preferences', async () => {
    expect(await draftSpaceBioAction('space-A')).toHaveProperty('data')
    expect(m.caps).toHaveBeenCalledWith(expect.objectContaining({ id: 'space-A' }), 'editor-A')
    expect(m.bio).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'space-A', profileId: 'editor-A', coachProfile: expect.objectContaining({ goals: 'Private goals for space-A' }) }))
    expect(JSON.stringify(m.bio.mock.calls)).not.toContain('Never supplied')
  })
  it('does not load grounding or invoke coaching for another tenant', async () => {
    expect(await suggestTaglineAction('space-B')).toHaveProperty('error')
    expect(m.grounding).not.toHaveBeenCalled()
    expect(m.coach).not.toHaveBeenCalled()
    expect(m.tagline).not.toHaveBeenCalled()
  })
  it('does not read Space data for a signed-out caller', async () => {
    m.actor.mockResolvedValue(null)
    expect(await draftSpaceBioAction('space-A')).toHaveProperty('error')
    expect(m.get).not.toHaveBeenCalled()
    expect(m.bio).not.toHaveBeenCalled()
  })
})

it('uses only the current unsaved author draft, bounds it, and does not mutate persistence', async () => {
  await draftSpaceBioAction('space-A', 'x'.repeat(5000))
  expect(m.bio.mock.calls[0][0].about).toHaveLength(4000)
  expect(m.bio.mock.calls[0][0].coachProfile.goals).toBe('Private goals for space-A')
  expect(m.grounding).toHaveBeenCalledExactlyOnceWith('space-A')
})
it('keeps an intentionally blank unsaved draft blank rather than resurrecting saved copy', async () => {
  await suggestTaglineAction('space-A', '')
  expect(m.tagline.mock.calls[0][0].about).toBe('')
})

it('keeps basic coaching available without public fallback when private preferences are unavailable', async () => {
  m.coach.mockResolvedValue({ available: false })
  await draftSpaceBioAction('space-A')
  expect(m.bio.mock.calls[0][0].coachProfile).toBeNull()
})

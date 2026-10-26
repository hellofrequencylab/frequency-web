import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySpaceCoachProfile } from '@/lib/spaces/coach-profile'
const mocks = vi.hoisted(() => ({ actor: vi.fn(), get: vi.fn(), caps: vi.fn(), patch: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.actor }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: mocks.get }))
vi.mock('@/lib/spaces/private-state', () => ({ writeSpaceCoachProfile: mocks.patch }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: mocks.caps }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { saveSpaceCoachProfile } from './actions'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.actor.mockResolvedValue('owner')
  mocks.get.mockResolvedValue({ id: 'space-A', slug: 'makers', preferences: { websiteEditor: 'keep' } })
  mocks.caps.mockResolvedValue({ canEditProfile: true })
  mocks.patch.mockResolvedValue(true)
})
describe('Space coach preference authorization and writes', () => {
  it('refuses signed-out callers before reading Space context', async () => {
    mocks.actor.mockResolvedValue(null)
    expect(await saveSpaceCoachProfile('space-A', emptySpaceCoachProfile())).toHaveProperty('error')
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.patch).not.toHaveBeenCalled()
  })
  it('refuses another owner and read-only staff, including clear', async () => {
    mocks.caps.mockResolvedValue({ canEditProfile: false, staffViewing: true })
    expect(await saveSpaceCoachProfile('space-B', null)).toHaveProperty('error')
    expect(mocks.caps).toHaveBeenCalledWith(expect.objectContaining({ id: 'space-A' }), 'owner')
    expect(mocks.patch).not.toHaveBeenCalled()
  })
  it('patches only the owned key using resolved Space identity', async () => {
    const profile = { ...emptySpaceCoachProfile(), goals: 'Return visits', voice: 'Plain and welcoming' }
    expect(await saveSpaceCoachProfile('space-A', profile)).toEqual({ data: profile })
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('space-A', profile)
    expect(mocks.revalidate).toHaveBeenCalledWith('/spaces/makers/settings/coach')
  })
  it('deletes only coach preferences on clear and returns empty state', async () => {
    expect(await saveSpaceCoachProfile('space-A', null)).toEqual({ data: emptySpaceCoachProfile() })
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('space-A', null)
  })
  it('preserves a failed save as an error without claiming success', async () => {
    mocks.patch.mockResolvedValue(false)
    expect(await saveSpaceCoachProfile('space-A', emptySpaceCoachProfile())).toHaveProperty('error')
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it('rejects malformed fields before storage', async () => {
    expect(await saveSpaceCoachProfile('space-A', { goals: 'x'.repeat(900) })).toHaveProperty('error')
    expect(mocks.patch).not.toHaveBeenCalled()
  })
})

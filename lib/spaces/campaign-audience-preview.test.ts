import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ caller: { id: 'profile-A', webRole: 'member' } as { id: string; webRole: string } | null, space: { id: 'space-A' } as { id: string } | null, canEdit: true, report: { state: 'available', topic: 'marketing', matched: 520, eligible: 0, excluded: { invalid: 0, duplicate: 0, unknownConsent: 520, unsubscribed: 0, suppressed: 0, muted: 0 } } }))
const read = vi.hoisted(() => vi.fn(async () => state.report))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/spaces/campaigns', () => ({ createSpaceCampaign: vi.fn(), updateSpaceCampaign: vi.fn(), scheduleSpaceCampaign: vi.fn(), sendSpaceCampaign: vi.fn() }))
vi.mock('@/lib/spaces/email-toggle', () => ({ setSpaceEmailEnabled: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => state.space }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: state.canEdit }) }))
vi.mock('@/lib/core/roles', () => ({ isJanitor: (role: string) => role === 'janitor' }))
vi.mock('@/lib/spaces/audience-readiness', () => ({ readAudienceEligibility: (...args: unknown[]) => read(...args as []) }))
import { previewSpaceAudience, countSpaceAudience } from './campaigns-actions'
beforeEach(() => { state.caller = { id: 'profile-A', webRole: 'member' }; state.space = { id: 'space-A' }; state.canEdit = true; read.mockClear() })
describe('authorized aggregate campaign preview', () => {
  it('gates privileged reads before they run for another Space or removed editor', async () => {
    state.canEdit = false
    expect((await previewSpaceAudience('space-B', {})).state).toBe('unavailable')
    expect(read).not.toHaveBeenCalled()
  })
  it('missing Space and anonymous callers cannot inspect the audience', async () => {
    state.space = null
    expect((await previewSpaceAudience('missing', {})).state).toBe('unavailable')
    expect(read).not.toHaveBeenCalled()
    state.space = { id: 'space-A' }; state.caller = null; state.canEdit = false
    expect((await previewSpaceAudience('space-A', {})).state).toBe('unavailable')
    expect(read).not.toHaveBeenCalled()
  })
  it('the compatibility count excludes unknown consent instead of returning raw contact matches', async () => {
    expect(await countSpaceAudience('space-A', {})).toBe(0)
    expect((await previewSpaceAudience('space-A', {}, 'events')).excluded.unknownConsent).toBe(520)
    expect(read).toHaveBeenCalledWith('space-A', {}, 'events')
  })
  it('allows the existing staff read-only preview without granting a send action', async () => {
    state.canEdit = false; state.caller = { id: 'staff', webRole: 'janitor' }
    expect((await previewSpaceAudience('space-A', {})).state).toBe('available')
    expect(read).toHaveBeenCalledOnce()
  })
})

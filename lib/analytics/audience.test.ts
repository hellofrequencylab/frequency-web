import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ profile: vi.fn(), role: vi.fn(), team: vi.fn(), consent: vi.fn(), cookies: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: mocks.cookies }) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.profile, getRealCallerWebRole: mocks.role }))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: mocks.consent }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: () => mocks.team(id) }) }) }) }) }))
import { currentViewerAllowsAnalytics } from './audience'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookies.mockReturnValue([])
  mocks.profile.mockResolvedValue('member-1')
  mocks.role.mockResolvedValue('none')
  mocks.team.mockResolvedValue({ data: null, error: null })
  mocks.consent.mockResolvedValue(true)
})
it('allows an anonymous request to proceed to its independent browser consent gate', async () => {
  mocks.profile.mockResolvedValue(null)
  expect(await currentViewerAllowsAnalytics()).toBe(true)
  expect(mocks.team).not.toHaveBeenCalled()
})
it('checks account analytics consent for the verified current profile', async () => {
  mocks.consent.mockResolvedValue(false)
  expect(await currentViewerAllowsAnalytics()).toBe(false)
  expect(mocks.consent).toHaveBeenCalledWith('member-1', 'analytics')
  expect(mocks.team).toHaveBeenCalledWith('member-1')
})
it('excludes real staff even when view-as would hide their effective staff role', async () => {
  mocks.role.mockResolvedValue('admin')
  expect(await currentViewerAllowsAnalytics()).toBe(false)
  expect(mocks.team).not.toHaveBeenCalled()
})
it('excludes functional staff with no web-role and fails closed on an unknown staff lookup', async () => {
  mocks.team.mockResolvedValue({ data: { profile_id: 'member-1' }, error: null })
  expect(await currentViewerAllowsAnalytics()).toBe(false)
  mocks.team.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
  expect(await currentViewerAllowsAnalytics()).toBe(false)
})


it('does not degrade an unresolved authenticated cookie to anonymous permission', async () => {
  mocks.profile.mockResolvedValue(null)
  mocks.cookies.mockReturnValue([{ name: 'sb-project-auth-token.0' }])
  expect(await currentViewerAllowsAnalytics()).toBe(false)
  expect(mocks.team).not.toHaveBeenCalled()
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ guard: vi.fn(), token: vi.fn(), read: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: mocks.guard }))
vi.mock('./google-auth', () => ({ getGoogleReportingAccessToken: mocks.token, googleReportingCredentialKey: () => 'test-key' }))
vi.mock('./google-data', async (original) => ({ ...await original<object>(), readGoogleReports: mocks.read }))
import { getGoogleAnalyticsReading } from './google-data-read'
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); mocks.guard.mockResolvedValue({ profileId: 'admin' }) })
describe('Google report authorization', () => {
  it('denies before credentials or provider data are accessed', async () => {
    mocks.guard.mockRejectedValue(new Error('denied'))
    await expect(getGoogleAnalyticsReading()).rejects.toThrow('denied')
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('keeps an unconfigured property inert despite a platform credential binding', async () => {
    vi.stubEnv('GA4_REPORTING_PROPERTY_ID', '')
    const result = await getGoogleAnalyticsReading()
    expect(result.state === 'unavailable' && result.reason).toBe('not_configured')
    expect(mocks.token).not.toHaveBeenCalled()
  })
})

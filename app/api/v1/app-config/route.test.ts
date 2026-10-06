import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appConfigResponse } from '@/lib/contract'
import { belowMinimum, compareVersions, parseVersion } from '@/lib/app-config/version'

// GET /api/v1/app-config (LIVE-722).

const settings: Record<string, string> = {}

vi.mock('@/lib/platform-flags', () => ({
  getPlatformSetting: async (key: string, fallback: string) => settings[key] || fallback,
  feedOpenFlag: async () => true,
  referralsEnabled: async () => false,
  aiEnabledFlag: async () => true,
  smsEnabledFlag: async () => false,
  chatDmRoutesRetiredFlag: async () => true,
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))

async function call(qs: string) {
  const { GET } = await import('./route')
  const res = await GET(new Request(`https://frequencylocal.com/api/v1/app-config${qs}`))
  const body = await res.json()
  expect(appConfigResponse.safeParse(body).success, JSON.stringify(body)).toBe(true)
  return { res, body }
}

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k]
})

describe('GET /api/v1/app-config', () => {
  it('supports every build while no minimum is set, and is publicly cacheable', async () => {
    const { res, body } = await call('?platform=ios&version=0.1.0')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(body.data).toMatchObject({ platform: 'ios', minSupportedVersion: '0.0.0', latestVersion: null, updateRequired: false })
    expect(body.data.flags).toEqual({ feedOpen: true, referrals: false, ai: true, sms: false, dmRoutesRetired: true })
  })

  it('tells a build below the minimum to update, per platform', async () => {
    settings.app_min_supported_version_ios = '1.4.0'
    settings.app_latest_version_ios = '1.5.2'
    expect((await call('?platform=ios&version=1.3.9')).body.data).toMatchObject({ updateRequired: true, latestVersion: '1.5.2' })
    expect((await call('?platform=ios&version=1.4')).body.data.updateRequired).toBe(false)
    expect((await call('?platform=android&version=1.0.0')).body.data.updateRequired).toBe(false)
  })

  it('refuses an unknown platform', async () => {
    expect((await call('?platform=palm')).res.status).toBe(400)
  })
})

describe('versions', () => {
  it('parses and compares dotted versions', () => {
    expect(parseVersion('1.4.2')).toEqual([1, 4, 2])
    expect(parseVersion('v1')).toBeNull()
    expect(compareVersions([1, 4], [1, 4, 0])).toBe(0)
    expect(compareVersions([1, 10], [1, 9])).toBeGreaterThan(0)
    expect(belowMinimum('garbage', '2.0.0')).toBe(false)
    expect(belowMinimum('1.9.9', '2.0.0')).toBe(true)
  })
})

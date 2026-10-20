import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-1125: a member card tapped on a phone opens the reader's own rewards (through sign-in when
// signed out). It never checks anyone in; a revoked or unknown card lands on /code-unavailable.

let profileId: string | null = 'p-1'
let enabled = true
let live = true
const isLive = vi.fn(async () => live)

vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => profileId }))
vi.mock('@/lib/devices/store', () => ({ scannerDevicesEnabled: () => enabled, cardTokenIsLive: isLive }))

const TOKEN = 'abcdefghijklmnopqrstuv'
const call = async (token: string) => {
  const { GET } = await import('./route')
  const res = await GET(new Request(`https://frequencylocal.com/c/${token}`), { params: Promise.resolve({ token }) })
  return new URL(res.headers.get('location') ?? '')
}

beforeEach(() => {
  profileId = 'p-1'
  enabled = true
  live = true
  isLive.mockClear()
})

describe('GET /c/<token>', () => {
  it('sends a signed-in member to /rewards', async () => {
    expect((await call(TOKEN)).pathname).toBe('/rewards')
  })

  it('sends a signed-out visitor through sign-in to /rewards', async () => {
    profileId = null
    const to = await call(TOKEN)
    expect(to.pathname).toBe('/sign-in')
    expect(to.searchParams.get('next')).toBe('/rewards')
  })

  it('says a revoked or malformed card is not active', async () => {
    live = false
    expect((await call(TOKEN)).pathname).toBe('/code-unavailable')
    expect((await call('nope')).pathname).toBe('/code-unavailable')
  })

  it('skips the lookup while the switch is off', async () => {
    enabled = false
    expect((await call(TOKEN)).pathname).toBe('/rewards')
    expect(isLive).not.toHaveBeenCalled()
  })
})

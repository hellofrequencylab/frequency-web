import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pushDeviceResponse } from '@/lib/contract'

// /api/v1/push/devices (LIVE-720): registers and revokes for the verified caller only.

let authOk = true
const register = vi.fn(async () => {})
const revoke = vi.fn(async () => {})

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
}))
vi.mock('@/lib/push-devices', () => ({ registerPushDevice: register, revokePushDevice: revoke }))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))

const URL_ = 'https://frequencylocal.com/api/v1/push/devices'
const TOKEN = 'ExponentPushToken[abcdefgh]'

async function send(method: 'POST' | 'DELETE', body: unknown) {
  const mod = await import('./route')
  const res = await mod[method](new Request(URL_, { method, body: JSON.stringify(body) }))
  const json = await res.json()
  expect(pushDeviceResponse.safeParse(json).success, JSON.stringify(json)).toBe(true)
  return { res, json }
}

beforeEach(() => {
  authOk = true
  register.mockClear()
  revoke.mockClear()
})

describe('/api/v1/push/devices', () => {
  it('registers a token for the caller, ignoring any profile in the body', async () => {
    const { res } = await send('POST', { platform: 'ios', provider: 'expo', token: TOKEN, appVersion: '1.0.0', profileId: 'p-2' })
    expect(res.status).toBe(200)
    expect(register).toHaveBeenCalledWith('p-1', { platform: 'ios', provider: 'expo', token: TOKEN, appVersion: '1.0.0' })
  })

  it('revokes for the caller', async () => {
    await send('DELETE', { token: TOKEN })
    expect(revoke).toHaveBeenCalledWith('p-1', TOKEN)
  })

  it('refuses a bad platform and a signed-out caller', async () => {
    expect((await send('POST', { platform: 'palm', provider: 'expo', token: TOKEN })).res.status).toBe(400)
    authOk = false
    expect((await send('POST', { platform: 'ios', provider: 'expo', token: TOKEN })).res.status).toBe(401)
    expect(register).not.toHaveBeenCalled()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-720: the Expo transport, and that it rides the ONE send gate in sendPushToProfile.

const deleted: string[][] = []
let devices: { id: string; token: string }[] = []
let gateAllowed = true
const fetchMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: table === 'push_devices' ? devices : [] }),
          then: (r: (v: unknown) => void) => r({ data: [] }),
        }),
      }),
      delete: () => ({ in: async (_c: string, ids: string[]) => { deleted.push(ids) } }),
      update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
    }),
  }),
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: gateAllowed }) }))
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => {} } }))

const payload = { title: 'Hi', body: 'A new post', url: '/feed' }

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('EXPO_ACCESS_TOKEN', 'expo-secret')
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
  vi.stubEnv('VAPID_PRIVATE_KEY', '')
  vi.stubGlobal('fetch', fetchMock)
  deleted.length = 0
  devices = [{ id: 'd1', token: 'ExponentPushToken[aaa]' }, { id: 'd2', token: 'ExponentPushToken[bbb]' }]
  gateAllowed = true
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('sendNativePush', () => {
  it('posts to Expo with the token, counts accepted tickets and prunes dead tokens', async () => {
    const { sendNativePush } = await import('./push-native')
    expect(await sendNativePush('p-1', payload)).toBe(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    expect(init.headers.authorization).toBe('Bearer expo-secret')
    expect(JSON.parse(init.body)[0]).toMatchObject({ to: 'ExponentPushToken[aaa]', title: 'Hi', data: { url: '/feed' } })
    expect(deleted).toEqual([['d2']])
  })

  it('is inert without EXPO_ACCESS_TOKEN', async () => {
    vi.stubEnv('EXPO_ACCESS_TOKEN', '')
    const { sendNativePush, nativePushEnabled } = await import('./push-native')
    expect(nativePushEnabled).toBe(false)
    expect(await sendNativePush('p-1', payload)).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sendPushToProfile', () => {
  it('reaches the native transport after the send gate, even with no VAPID keys', async () => {
    const { sendPushToProfile } = await import('./push')
    expect(await sendPushToProfile('p-1', payload, 'social' as never)).toBe(1)
  })

  it('sends nothing when the gate refuses', async () => {
    gateAllowed = false
    const { sendPushToProfile } = await import('./push')
    expect(await sendPushToProfile('p-1', payload, 'social' as never)).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

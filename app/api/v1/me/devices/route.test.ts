import { beforeEach, describe, expect, it, vi } from 'vitest'
import { myDeviceResponse, myDevicesResponse } from '@/lib/contract'

// LIVE-1120: the caller's controllable devices, and the owner's relay switch.

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const DEVICE = {
  id: ID,
  label: 'CU5K',
  space: { id: '9b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f', name: 'Royal Temple', slug: 'royal-temple' },
  channel: `device:${ID}`,
  relayEnabled: true,
  allowedCmds: ['system.status', 'led.set'],
  owned: true,
  lastSeenAt: '2026-10-19T20:00:00.000Z',
}

let authOk = true
let relayOn = true
const list = vi.fn(async (_p: string) => [DEVICE])
const update = vi.fn(async (_p: string, _id: string, _patch: unknown): Promise<typeof DEVICE | null> => DEVICE)

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
}))
vi.mock('@/lib/devices/relay-store', () => ({
  deviceRelayEnabled: () => relayOn,
  listManagedDevices: list,
  updateRelaySetting: update,
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))

beforeEach(() => {
  authOk = true
  relayOn = true
  list.mockClear()
  update.mockClear()
})

async function get() {
  const { GET } = await import('./route')
  const res = await GET(new Request('https://frequencylocal.com/api/v1/me/devices'))
  const json = await res.json()
  expect(myDevicesResponse.safeParse(json).success, JSON.stringify(json)).toBe(true)
  return { res, json }
}

async function patch(id: string, body: unknown) {
  const { PATCH } = await import('./[id]/route')
  const res = await PATCH(new Request(`https://frequencylocal.com/api/v1/me/devices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })
  const json = await res.json()
  expect(myDeviceResponse.safeParse(json).success, JSON.stringify(json)).toBe(true)
  return { res, json }
}

describe('GET /api/v1/me/devices', () => {
  it('lists the devices the caller manages', async () => {
    const { res, json } = await get()
    expect(res.status).toBe(200)
    expect(json.data).toEqual({ items: [DEVICE], relayAvailable: true })
    expect(list).toHaveBeenCalledWith('p-1')
  })

  it('is empty with relayAvailable false while the switch is off', async () => {
    relayOn = false
    const { json } = await get()
    expect(json.data).toEqual({ items: [], relayAvailable: false })
    expect(list).not.toHaveBeenCalled()
  })

  it('is a 401 signed out', async () => {
    authOk = false
    expect((await get()).res.status).toBe(401)
    expect(list).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/me/devices/{id}', () => {
  it('switches the relay for the caller, ignoring any profile in the body', async () => {
    const { res } = await patch(ID, { relayEnabled: false, profileId: 'p-2' })
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith('p-1', ID, { relayEnabled: false })
  })

  it('refuses cli.run, an empty body and a bad id', async () => {
    expect((await patch(ID, { allowedCmds: ['cli.run'] })).res.status).toBe(400)
    expect((await patch(ID, {})).res.status).toBe(400)
    expect((await patch('not-a-uuid', { relayEnabled: true })).res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('is not_found for a device the caller does not manage, or while the switch is off', async () => {
    update.mockResolvedValueOnce(null)
    expect((await patch(ID, { relayEnabled: true })).res.status).toBe(404)
    relayOn = false
    expect((await patch(ID, { relayEnabled: true })).res.status).toBe(404)
    authOk = false
    expect((await patch(ID, { relayEnabled: true })).res.status).toBe(401)
  })
})

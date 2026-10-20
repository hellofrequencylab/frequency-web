import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-1155: the token mint refuses a switched-off relay and a missing secret, signs for the
// credential's device only, and hands the device its allow-list.

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
let row: Record<string, unknown> | null = null

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
  }),
}))
vi.mock('@/lib/supabase/env', () => ({ supabaseUrl: () => 'https://abc.supabase.co', supabaseAnonKey: () => 'anon-key' }))

const device = { id: ID, spaceId: 's-1', label: 'CU5K' }

beforeEach(() => {
  row = { relay_enabled: true, relay_allowed_cmds: ['led.set', 'cli.run', 'system.status'], owner_profile_id: 'p-1' }
  process.env.SUPABASE_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters'
  process.env.DEVICE_RELAY_ENABLED = ''
})

describe('mintRelayToken', () => {
  it('signs for the device and returns its channel and sanitized allow-list', async () => {
    const { mintRelayToken } = await import('./relay-store')
    const out = await mintRelayToken(device)
    expect(out).toMatchObject({
      ok: true,
      channel: `device:${ID}`,
      realtime_url: 'wss://abc.supabase.co/realtime/v1/websocket',
      apikey: 'anon-key',
      allowed_cmds: ['system.status', 'led.set'],
    })
    if (!out.ok) throw new Error('expected a token')
    const claims = JSON.parse(Buffer.from(out.token.split('.')[1], 'base64url').toString())
    expect(claims).toMatchObject({ role: 'anon', device_id: ID, frequency_kind: 'device', exp: out.expires_at })
  })

  it('refuses when the relay is off or was never set up', async () => {
    const { mintRelayToken } = await import('./relay-store')
    row = { relay_enabled: false, relay_allowed_cmds: [], owner_profile_id: null }
    expect(await mintRelayToken(device)).toEqual({ ok: false, reason: 'relay_disabled' })
    row = null
    expect(await mintRelayToken(device)).toEqual({ ok: false, reason: 'relay_disabled' })
  })

  it('refuses without a signing secret of real length', async () => {
    const { mintRelayToken } = await import('./relay-store')
    process.env.SUPABASE_JWT_SECRET = 'short'
    expect(await mintRelayToken(device)).toEqual({ ok: false, reason: 'not_configured' })
    delete process.env.SUPABASE_JWT_SECRET
    expect(await mintRelayToken(device)).toEqual({ ok: false, reason: 'not_configured' })
  })

  it('reads the switch through envFlag', async () => {
    const { deviceRelayEnabled } = await import('./relay-store')
    expect(deviceRelayEnabled()).toBe(false)
    process.env.DEVICE_RELAY_ENABLED = 'on'
    expect(deviceRelayEnabled()).toBe(true)
  })
})

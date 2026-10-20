import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
import { relayCommand } from '@/lib/contract'
import {
  RELAY_COMMANDS,
  RELAY_TOKEN_TTL_SECONDS,
  realtimeUrl,
  relayTopic,
  sanitizeAllowedCommands,
  signDeviceToken,
} from './relay'

// LIVE-1120: the device's Realtime token and the names both ends of the relay agree on.

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const SECRET = 'super-secret-jwt-token-with-at-least-32-characters'

function decode(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

describe('signDeviceToken', () => {
  it('signs an HS256 JWT the project secret verifies', () => {
    const { token } = signDeviceToken(ID, SECRET, 1_760_000_000)
    const [h, p, s] = token.split('.')
    expect(decode(h)).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')).toBe(s)
    expect(createHmac('sha256', 'another-secret-that-is-also-32-characters').update(`${h}.${p}`).digest('base64url')).not.toBe(s)
  })

  it('is role anon, pinned to the device, and short-lived', () => {
    const { token, claims } = signDeviceToken(ID, SECRET, 1_760_000_000)
    const payload = decode(token.split('.')[1])
    expect(payload).toEqual(claims)
    expect(payload).toMatchObject({ role: 'anon', sub: ID, device_id: ID, frequency_kind: 'device', iat: 1_760_000_000 })
    expect(payload.exp - payload.iat).toBe(RELAY_TOKEN_TTL_SECONDS)
    expect(RELAY_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(15 * 60)
  })
})

describe('relay names', () => {
  it('meets on device:<id> at the project realtime websocket', () => {
    expect(relayTopic(ID)).toBe(`device:${ID}`)
    expect(realtimeUrl('https://abc.supabase.co')).toBe('wss://abc.supabase.co/realtime/v1/websocket')
    expect(realtimeUrl('http://127.0.0.1:54321/')).toBe('ws://127.0.0.1:54321/realtime/v1/websocket')
  })

  it('never lets cli.run or an unknown command onto the allow-list', () => {
    expect(RELAY_COMMANDS).not.toContain('cli.run')
    expect(sanitizeAllowedCommands(['led.set', 'cli.run', 'nope', 'system.status', 'led.set', 7])).toEqual([
      'system.status',
      'led.set',
    ])
    expect(sanitizeAllowedCommands(null)).toEqual([])
  })

  it('matches the app contract enum exactly', () => {
    expect([...relayCommand.options]).toEqual([...RELAY_COMMANDS])
  })
})

// INTERNET RELAY, the pure half (LIVE-1155, ADR-1870, docs/LOYALTY.md section 8 "Internet relay").
// The device token and the names both ends agree on. Crypto only, no IO: unit-tested in relay.test.ts.
//
// A device joins Supabase Realtime with a token THIS server signs (HS256, the project JWT secret,
// server-side only), never the member session system: a device has no Frequency account. The token
//   · is role `anon`, so in PostgREST it reaches only what a signed-out visitor already can;
//   · carries `frequency_kind: 'device'` and `device_id`, which the realtime.messages policy
//     (supabase/migrations/20270346015500_device_relay.sql) requires before it admits the join, and
//     only on topic `device:<device_id>`;
//   · has `sub` = the device id, a uuid with no auth user, so `auth.uid()` in any other policy
//     casts cleanly and matches no profile;
//   · lives RELAY_TOKEN_TTL_SECONDS. The device re-mints about two minutes before expiry or on a 401.

import { createHmac } from 'crypto'

export const RELAY_TOKEN_TTL_SECONDS = 15 * 60

/** The commands that may ever cross the relay. cli.run is never one: it would be a remote shell. */
export const RELAY_COMMANDS = [
  'system.status',
  'apps.list',
  'lightshow.state',
  'lightshow.set',
  'led.set',
  'led.mode',
  'sound.tone',
  'light.read',
  'sensors.read',
  'frequency.read_tag',
] as const
export type RelayCommand = (typeof RELAY_COMMANDS)[number]

/** The Realtime topic a device and its managers meet on. */
export function relayTopic(deviceId: string): string {
  return `device:${deviceId}`
}

/** The Realtime websocket for a project URL (`https://x.supabase.co` → `wss://x.supabase.co/realtime/v1/websocket`). */
export function realtimeUrl(projectUrl: string): string {
  const u = new URL(projectUrl)
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:'
  u.pathname = '/realtime/v1/websocket'
  u.search = ''
  u.hash = ''
  return u.toString()
}

/** Keep only known relay commands, in their canonical order, without duplicates. */
export function sanitizeAllowedCommands(raw: readonly unknown[] | null | undefined): RelayCommand[] {
  const wanted = new Set((raw ?? []).filter((c): c is string => typeof c === 'string'))
  return RELAY_COMMANDS.filter((c) => wanted.has(c))
}

interface DeviceTokenClaims {
  role: 'anon'
  iss: 'frequency'
  sub: string
  device_id: string
  frequency_kind: 'device'
  iat: number
  exp: number
}

/**
 * Sign the device's Realtime token. `now` is seconds since the epoch. Returns the JWT and its expiry.
 * The secret is the project's JWT secret (the legacy HS256 secret, or a shared-secret signing key
 * Supabase accepts); it never leaves the server.
 */
export function signDeviceToken(
  deviceId: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): { token: string; claims: DeviceTokenClaims } {
  const claims: DeviceTokenClaims = {
    role: 'anon',
    iss: 'frequency',
    sub: deviceId,
    device_id: deviceId,
    frequency_kind: 'device',
    iat: now,
    exp: now + RELAY_TOKEN_TTL_SECONDS,
  }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify(claims))
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return { token: `${header}.${payload}.${signature}`, claims }
}

function b64url(json: string): string {
  return Buffer.from(json, 'utf8').toString('base64url')
}

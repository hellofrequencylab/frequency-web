// COUNTER SCANNERS, the pure half (LIVE-1113, docs/LOYALTY.md "Counter scanners"). Secrets, tokens and
// the hashes the database keeps instead of them. Crypto only, no IO: unit-tested in credentials.test.ts.
//
//   • A device authenticates with `X-Frequency-Device: <device id>.<secret>`. The secret is 32 random
//     bytes in base64url, shown to the owner once; the row keeps sha256(secret) in hex.
//   • A member card carries an opaque token, 16 random bytes in base64url. The row keeps sha256(token).
//     A token is high-entropy, so a plain hash is enough; nothing about the member is in it.
//   • A card chip's UID is 4 to 10 bytes and guessable, so it is kept as an HMAC under the server's
//     signing key (namespaced `card-uid:`), never a plain hash a table read could reverse.
//
// The device header is NOT `Authorization: Bearer`: lib/contract/caller.ts 401s any bearer that is not
// a Supabase session, and the two auth systems stay apart on purpose.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { signingSecret } from '@/lib/signing-secret'

/** The request header a scanner authenticates with. */
export const DEVICE_HEADER = 'x-frequency-device'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const B64URL = /^[A-Za-z0-9_-]+$/

/** sha256 in hex: the stored form of a device secret and a card token. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** A new device secret: 32 random bytes, base64url (43 characters). */
export function newDeviceSecret(): string {
  return randomBytes(32).toString('base64url')
}

/** A new card token: 16 random bytes, base64url (22 characters). */
export function newCardToken(): string {
  return randomBytes(16).toString('base64url')
}

/** Split `<uuid>.<secret>` into its parts, or null for any other shape. */
export function parseDeviceHeader(raw: string | null | undefined): { id: string; secret: string } | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const id = value.slice(0, dot).toLowerCase()
  const secret = value.slice(dot + 1)
  if (!UUID.test(id)) return null
  if (secret.length < 32 || secret.length > 128 || !B64URL.test(secret)) return null
  return { id, secret }
}

/** Constant-time compare of a presented secret against the stored sha256 hex. */
export function secretMatches(presented: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || storedHash.length !== 64) return false
  const a = Buffer.from(sha256Hex(presented), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** A card token as the device read it, or null when it cannot be one. */
export function normalizeCardToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return t.length >= 16 && t.length <= 128 && B64URL.test(t) ? t : null
}

/** A chip UID as hex, upper-case, separators dropped (`04:a2:1f…` → `04A21F…`), or null. 4 to 10 bytes. */
export function normalizeUid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const hex = raw.replace(/[\s:-]/g, '').toUpperCase()
  return /^[0-9A-F]{8,20}$/.test(hex) && hex.length % 2 === 0 ? hex : null
}

/** The stored form of a chip UID: HMAC-SHA256 under the server signing key, hex. */
export function hashUid(uid: string): string {
  const key = signingSecret('card-uid', ['UNSUBSCRIBE_SECRET'])
  return createHmac('sha256', key).update(`card-uid:v1:${uid}`).digest('hex')
}

/** A member handle as typed at the counter (`@Maya` → `maya`), or null. */
export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const h = raw.trim().replace(/^@/, '').toLowerCase()
  return /^[a-z0-9_.-]{1,40}$/.test(h) ? h : null
}

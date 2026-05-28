// Stateless unsubscribe tokens.
//
// HMAC-signed (profile_id, category) tuples that work without a DB lookup.
// Lets us drop `?p=...&c=...&t=...` URLs in email footers and have them
// keep working even years later, no state to maintain.
//
// Why HMAC, not JWT: JWT carries claims and an exp — neither helps here.
// We want a permanent revocation lever, not a session token. HMAC of
// (profileId, category) is the minimum that proves "we issued this URL
// for this person, for this category" and that's all we need.

import { createHmac, timingSafeEqual } from 'crypto'
import type { NotificationCategory } from '@/lib/notification-preferences'

// In production: set UNSUBSCRIBE_SECRET to a 32+ byte random string.
// In dev: falls back to the service-role key prefix so tests work, but
// emails generated locally won't validate against production-issued ones.
function getSecret(): string {
  const explicit = process.env.UNSUBSCRIBE_SECRET
  if (explicit) return explicit
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32)
  if (!fallback) {
    throw new Error(
      '[unsubscribe-tokens] No UNSUBSCRIBE_SECRET and no SUPABASE_SERVICE_ROLE_KEY — cannot sign.',
    )
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[unsubscribe-tokens] UNSUBSCRIBE_SECRET not set in production. ' +
      'Tokens will rotate if the service-role key rotates. Set an explicit secret.',
    )
  }
  return fallback
}

export function makeUnsubscribeToken(
  profileId: string,
  category: NotificationCategory,
): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(`${profileId}:${category}`)
  // 16 bytes (32 hex chars) is enough — first half of SHA-256. Brute-force
  // an 8-byte tag would still need 2^64 tries.
  return hmac.digest('hex').slice(0, 32)
}

export function verifyUnsubscribeToken(
  profileId: string,
  category: NotificationCategory,
  token: string,
): boolean {
  if (!token || token.length !== 32) return false
  const expected = makeUnsubscribeToken(profileId, category)
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

export function buildUnsubscribeUrl(params: {
  baseUrl:   string
  profileId: string
  category:  NotificationCategory
}): string {
  const { baseUrl, profileId, category } = params
  const token = makeUnsubscribeToken(profileId, category)
  return `${baseUrl}/unsubscribe?p=${encodeURIComponent(profileId)}&c=${encodeURIComponent(category)}&t=${token}`
}

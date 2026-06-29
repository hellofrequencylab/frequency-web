// Slug + destination helpers for managed dynamic codes (`qr_codes`). Pure and
// dependency-light so they unit-test without a DB. The DB write paths live in the
// admin actions; the resolve path lives in app/q/[slug].

import { randomBytes } from 'crypto'

// Unambiguous base32-ish alphabet: no 0/o, 1/l/i — a slug is read off a screen or
// typed from a poster, so visually confusable characters are excluded.
const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const SLUG_RE = /^[a-z0-9-]{3,48}$/

export type DestinationType = 'url' | 'node' | 'circle' | 'event'

/** A random, unambiguous slug for the /q/<slug> short link. */
export function generateSlug(length = 7): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length]
  return out
}

/** Normalize a user-entered custom slug to the allowed shape (lowercase, hyphens
 *  for spaces, stripped of anything else). Returns '' if nothing usable remains. */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}

/** Validate a redirect target. A 'url' code may point ANYWHERE (that's the point of
 *  a retargetable marketing link); we only insist it's a real http(s) URL or a
 *  site-relative path. */
/** Whether a code is currently resolvable: active and within its validity window.
 *  Time is read here (in a plain module) rather than in the resolver component, so
 *  render stays pure. */
export function isCodeLive(
  code: { active: boolean; valid_from: string | null; valid_until: string | null },
  now: number = Date.now(),
): boolean {
  if (!code.active) return false
  if (code.valid_from && new Date(code.valid_from).getTime() > now) return false
  if (code.valid_until && new Date(code.valid_until).getTime() < now) return false
  return true
}

export function isValidTargetUrl(url: string): boolean {
  const u = url.trim()
  if (u.startsWith('/')) {
    // Site-relative only. Reject protocol-relative ('//evil.com') and backslash-tricked
    // ('/\evil.com') leading slashes: a browser treats both as off-site, so allowing them
    // would turn splash links (space-owner editable) into an open redirect off /q/<slug>.
    return !u.startsWith('//') && !u.startsWith('/\\')
  }
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

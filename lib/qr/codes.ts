// Slug + destination helpers for managed dynamic codes (`qr_codes`). Pure and
// dependency-light so they unit-test without a DB. The DB write paths live in the
// admin actions; the resolve path lives in app/q/[slug].

import { randomBytes } from 'crypto'

// Unambiguous base32-ish alphabet: no 0/o, 1/l/i — a slug is read off a screen or
// typed from a poster, so visually confusable characters are excluded.
const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const SLUG_RE = /^[a-z0-9-]{3,48}$/

export type DestinationType = 'url' | 'node' | 'circle' | 'event'

// ── Why this is not `byte % alphabet.length` (CodeQL: biased random from a secure source) ─────
//
// The alphabet is 31 characters and a byte holds 256 values. 256 = 8x31 + 8, so folding a byte with
// `%` gives the FIRST EIGHT characters nine chances each and the other twenty-three only eight —
// about 12.5% more often. randomBytes is a CSPRNG, and this threw that away on the last line.
//
// It is small and it is real. These slugs are the /q/<slug> namespace: they are guessed at by anyone
// who wants to find codes they were not given, and a known skew is exactly the head start a guesser
// wants. Rejection sampling costs nothing measurable and removes it entirely.

/** The largest multiple of the alphabet length that fits in a byte (248 for 31 characters). Bytes at
 *  or above it are REJECTED rather than folded, because folding them is the whole bias. */
export const SLUG_UNBIASED_CEILING = 256 - (256 % SLUG_ALPHABET.length)

/** One random byte to one slug character, or null when the byte must be redrawn. Exported so the
 *  boundary can be pinned by a test that enumerates every byte rather than sampling. */
export function slugCharForByte(b: number): string | null {
  return b >= SLUG_UNBIASED_CEILING ? null : SLUG_ALPHABET[b % SLUG_ALPHABET.length]
}

/** A random, unambiguous slug for the /q/<slug> short link. Uniform over the alphabet. */
export function generateSlug(length = 7): string {
  let out = ''
  while (out.length < length) {
    // Over-draw a little: ~3% of bytes are rejected, so one round almost always finishes.
    for (const b of randomBytes(length - out.length + 8)) {
      const ch = slugCharForByte(b)
      if (ch === null) continue
      out += ch
      if (out.length === length) break
    }
  }
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

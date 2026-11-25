import { createHmac, timingSafeEqual } from 'crypto'
import { signingSecret } from '@/lib/signing-secret'

// THE FIND A TIME EMAIL LINK (EMAIL-092). Email is the only outside channel for now (owner ruling
// 2026-11-24), so an outside collaborator (a venue, a guest teacher) picks a date from their inbox
// with no account. The link carries one signed, expiring token per person per Plan; holding it is
// the authorisation to answer that Plan's candidate dates as that email address, and nothing else.
//
// Shape: `<planId>.<email, base64url>.<exp seconds>.<sig>`. The signature is an HMAC over the three
// parts in their own namespace (`time-vote:`), so no other product token verifies here and this one
// verifies nowhere else. Stateless: no row to keep, and a forwarded link goes stale on its own.

const TIME_VOTE_TTL_DAYS = 21

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

const secret = (): string => signingSecret('time-vote-tokens', ['TIME_VOTE_SECRET', 'UNSUBSCRIBE_SECRET'])

export function normalizeVoteEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const e = email.trim().toLowerCase()
  return e.length <= 320 && EMAIL_RE.test(e) ? e : null
}

function sign(planId: string, email: string, exp: number): string {
  return createHmac('sha256', secret()).update(`time-vote:${planId.toLowerCase()}:${email}:${exp}`).digest('hex').slice(0, 32)
}

/** A link token for one person on one Plan, good for `ttlDays`. Null when the inputs are not a real
 *  Plan id and email address. */
export function signTimeVoteToken(
  planId: string,
  email: string,
  opts: { ttlDays?: number; now?: number } = {},
): string | null {
  const e = normalizeVoteEmail(email)
  if (!e || !UUID_RE.test(planId)) return null
  const exp = Math.floor((opts.now ?? Date.now()) / 1000) + Math.round((opts.ttlDays ?? TIME_VOTE_TTL_DAYS) * 86_400)
  const em = Buffer.from(e, 'utf8').toString('base64url')
  return `${planId.toLowerCase()}.${em}.${exp}.${sign(planId, e, exp)}`
}

/** The Plan and the email a token was issued for, or null when it is malformed, forged or expired.
 *  Constant-time compare; every failure looks the same to the caller. */
export function verifyTimeVoteToken(token: unknown, now: number = Date.now()): { planId: string; email: string; exp: number } | null {
  if (typeof token !== 'string' || token.length > 700) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [planId, em, expRaw, sig] = parts
  if (!UUID_RE.test(planId) || !/^\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{32}$/.test(sig)) return null
  const exp = Number(expRaw)
  if (exp * 1000 < now) return null
  let email: string | null
  try {
    email = normalizeVoteEmail(Buffer.from(em, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!email) return null
  const expected = sign(planId, email, exp)
  try {
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) return null
  } catch {
    return null
  }
  return { planId: planId.toLowerCase(), email, exp }
}

/** The page the link opens. */
export function timeVotePath(token: string): string {
  return `/find-a-time/${encodeURIComponent(token)}`
}

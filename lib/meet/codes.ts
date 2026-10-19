// TAP TO MEET, the pure half (LIVE-946, ADR-1785, docs/LOYALTY.md section 6). The code one member shows
// another, how long it lives, and the one line each outcome prints. No Supabase, no Next:
// lib/meet/codes.test.ts covers it. The IO lives in ./store.ts.

import { randomBytes } from 'crypto'
import { SITE_URL } from '@/lib/site'

/** How long a shown code claims. Long enough to open a camera, short enough that a screenshot is worthless. */
export const MEET_CODE_TTL_SECONDS = 60

/** Zaps each member earns for a meet (zap_config 'meetup_tap'; lib/zaps.ts fallback). */
export const MEETUP_TAP_ZAPS = 15

/** Unambiguous: no 0, 1, I or O. Eight characters is 36 bits, far past a 60-second guess. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 8

/** A fresh code. Uniform over the alphabet (32 symbols, so every byte maps cleanly). Pure over randomness. */
export function generateMeetCode(): string {
  let out = ''
  for (const b of randomBytes(LENGTH)) out += ALPHABET[b % ALPHABET.length]
  return out
}

/** Read a typed or pasted code back to its canonical form, or null when it cannot be one. Pure. */
export function normalizeMeetCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
  return c.length === LENGTH ? c : null
}

/** The absolute link a code's QR encodes. Pure. */
export function meetUrl(code: string): string {
  return `${SITE_URL}/meet/${code}`
}

/** "K7Q2 MX4P", for reading aloud. Pure. */
export function formatMeetCode(code: string): string {
  return code.length === LENGTH ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}

type MeetTapReason = 'unknown' | 'expired' | 'self' | 'daily_cap' | 'already_this_week' | 'failed'

export interface MeetTapReply {
  ok: boolean
  reason: MeetTapReason | null
  otherProfileId: string | null
}

/** The RPC's jsonb reply, narrowed. Anything malformed reads as failed. Pure. */
export function readTapReply(raw: unknown): MeetTapReply {
  const r = (raw ?? {}) as Record<string, unknown>
  const other = typeof r.other_profile_id === 'string' ? r.other_profile_id : null
  if (r.ok === true) return { ok: true, reason: null, otherProfileId: other }
  const reasons: MeetTapReason[] = ['unknown', 'expired', 'self', 'daily_cap', 'already_this_week']
  const reason = reasons.find((x) => x === r.reason) ?? 'failed'
  return { ok: false, reason, otherProfileId: other }
}

/** The one line the tapper reads. Pure. */
export function tapLine(reply: MeetTapReply, otherName: string | null, zaps: number): string {
  const who = otherName || 'them'
  if (reply.ok) return zaps > 0 ? `You met ${who}. ${zaps} Zaps each.` : `You met ${who}.`
  switch (reply.reason) {
    case 'expired':
      return 'That code has expired. Ask them to show a fresh one.'
    case 'self':
      return 'That is your own code.'
    case 'daily_cap':
      return 'Three meets a day. Come back tomorrow.'
    case 'already_this_week':
      return `You and ${who} already met this week.`
    case 'unknown':
      return 'No code like that. Check the letters and try again.'
    default:
      return 'Could not record that. Try again.'
  }
}

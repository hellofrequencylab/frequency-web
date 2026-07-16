'use server'

import { headers } from 'next/headers'
import { rateLimitOk } from '@/lib/rate-limit'
import { parseLeadLink } from '@/lib/crm/lead-links'
import { acceptWarmIntro } from '@/lib/crm/lead-capture'

export type AcceptResult = { ok: true } | { ok: false; error: string }

/**
 * FRONT DOOR #2 (accept step) — the DOUBLE-OPT-IN. The introduced person confirms they want to hear
 * from the Space. This is the moment capture becomes consent: acceptWarmIntro() flips the sealed lead
 * MAILABLE ('subscribed', only from 'unknown' — never resurrecting a hard opt-out) and logs it. The
 * Space + the sealed contact come only from the signed token (minted when the operator ran the intro),
 * so nobody can flip a stranger's consent. Rate-limited; fail-safe.
 */
export async function acceptIntro(token: string): Promise<AcceptResult> {
  const payload = parseLeadLink(token)
  if (!payload || payload.d !== 'warm_intro' || !payload.c) {
    return { ok: false, error: 'This link is no longer valid. Ask whoever introduced you for a fresh one.' }
  }

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('lead_intro', ip, 12, '10 m'))) {
    return { ok: false, error: 'Too many tries. Give it a few minutes and try again.' }
  }

  const done = await acceptWarmIntro(payload.s, payload.c)
  if (!done) return { ok: false, error: 'Something went wrong on our end. Please try again.' }
  return { ok: true }
}

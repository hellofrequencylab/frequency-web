'use server'

import { headers } from 'next/headers'
import { rateLimitOk } from '@/lib/rate-limit'
import { verifyEventInviteToken } from '@/lib/qr/event-invite'
import { captureEventGuest, type GuestRsvpStatus } from '@/lib/events/guests'

export type RsvpResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const RSVP_STATUSES: GuestRsvpStatus[] = ['going', 'maybe', 'declined']

// Public, non-member event RSVP capture (ADR-154). AUTH: the inviter + event are carried
// ONLY by the signed token (lib/qr/event-invite.ts) — never a client-supplied id. This
// action re-verifies the token server-side (the load-time check is not trusted) and hands
// the resolved inviter/event to the triple-write orchestrator.
//
// ANTI-ENUMERATION: the response is identical for every validly-formed submission — we do
// NOT reveal whether the token was valid, whether the person already existed, or whether
// any write leg landed. The only non-success replies are a malformed email (UX) and a
// rate-limit (abuse). Nothing here ever exposes the inviter's other contacts.
export async function submitEventGuest(input: {
  token: string
  displayName: string
  email: string
  phone?: string
  rsvpStatus?: string
}): Promise<RsvpResult> {
  const displayName = (input.displayName || '').trim()
  const email = (input.email || '').trim().toLowerCase()
  const phone = (input.phone || '').trim() || null
  const rsvpStatus = RSVP_STATUSES.includes(input.rsvpStatus as GuestRsvpStatus)
    ? (input.rsvpStatus as GuestRsvpStatus)
    : null

  // Throttle this open, unauthenticated endpoint per IP (abuse / enumeration guard).
  // Fails CLOSED in production when Upstash is unconfigured (lib/rate-limit.ts).
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('event_guest', ip, 5, '10 m'))) {
    return { ok: false, error: 'Too many requests. Please try again in a few minutes.' }
  }

  // Basic UX validation (not enumeration — the reader sees only their own input echoed back).
  if (!displayName) return { ok: false, error: 'Please add your name.' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address.' }

  // Resolve the inviter + event from the SIGNED token only. A bad/expired token yields the
  // generic success below (no capture, no leak of token validity).
  const invite = verifyEventInviteToken(input.token)
  if (invite) {
    // The orchestrator is fail-safe by contract; the marketing leg is best-effort. We never
    // branch the reply on its result, so the response stays identical regardless.
    await captureEventGuest({
      inviterProfileId: invite.inviterProfileId,
      eventId: invite.eventId,
      displayName,
      email,
      phone,
      rsvpStatus,
    }).catch(() => {})
  }

  return { ok: true }
}

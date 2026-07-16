'use server'

import { headers } from 'next/headers'
import { rateLimitOk } from '@/lib/rate-limit'
import { parseLeadLink } from '@/lib/crm/lead-links'
import { captureEventLead } from '@/lib/crm/lead-capture'
import type { CaptureSubmitResult } from '@/components/crm/leads/capture-form'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * FRONT DOOR #3 — event / attendance capture. Seals an attendee as a lead and records the attendance
 * tier so the Space can map tier -> lifecycle stage. Attendance is NOT marketing consent, so the lead
 * stays sealed 'unknown' (the engine enforces this). Public + unauthenticated: honeypot, rate limit,
 * anti-enumeration. Space + event come only from the signed token.
 */
export async function captureCheckIn(input: {
  token: string
  name: string
  email: string
  phone: string
  company: string
}): Promise<CaptureSubmitResult> {
  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim() || null
  const phone = (input.phone || '').trim() || null

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  const done: CaptureSubmitResult = {
    ok: true,
    heading: "You're checked in.",
    message: 'Thanks for coming. Good to have you here.',
  }

  // Honeypot: same success, no write.
  if ((input.company || '').trim()) return done

  const payload = parseLeadLink(input.token)
  if (!payload || payload.d !== 'event') {
    return { ok: false, error: 'This check-in link is no longer valid. Ask a host for a fresh one.' }
  }

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('lead_checkin', ip, 12, '10 m'))) {
    return { ok: false, error: 'Too many tries. Give it a few minutes and try again.' }
  }

  await captureEventLead({
    spaceId: payload.s,
    email,
    phone,
    displayName: name,
    eventTitle: payload.w ?? payload.l ?? null,
    tier: payload.tr ?? 'attended',
  }).catch(() => null)

  return done
}

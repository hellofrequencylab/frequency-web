'use server'

import { headers } from 'next/headers'
import { rateLimitOk } from '@/lib/rate-limit'
import { parseLeadLink, isSafeHttpUrl } from '@/lib/crm/lead-links'
import { captureShareBack } from '@/lib/crm/lead-capture'
import type { CaptureSubmitResult } from '@/components/crm/leads/capture-form'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * FRONT DOOR #5 — reciprocal share-back (a la HiHello / Blinq). Both parties trade: the visitor leaves
 * their details and gets the Space's card back. Sealed NOT mailable (a swap is not a subscription). The
 * reciprocal card is public info carried in the signed token, so the reveal needs no extra read. Public
 * + unauthenticated: honeypot, rate limit, anti-enumeration.
 */
export async function captureExchange(input: {
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

  const payload = parseLeadLink(input.token)
  if (!payload || payload.d !== 'share_back') {
    return { ok: false, error: 'This link is no longer valid. Ask them to share it again.' }
  }

  const card = {
    name: payload.by?.trim() || 'Their details',
    lines: [payload.l?.trim()].filter(Boolean) as string[],
    ...(isSafeHttpUrl(payload.r) ? { href: payload.r as string, hrefLabel: 'Open their page' } : {}),
  }
  const done: CaptureSubmitResult = {
    ok: true,
    heading: 'Swapped.',
    message: "Here's how to reach them back.",
    card,
  }

  // Honeypot: hand back the card, write nothing.
  if ((input.company || '').trim()) return done

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('lead_exchange', ip, 12, '10 m'))) {
    return { ok: false, error: 'Too many tries. Give it a few minutes and try again.' }
  }

  await captureShareBack({
    spaceId: payload.s,
    email,
    phone,
    displayName: name,
    where: payload.w ?? null,
  }).catch(() => null)

  return done
}

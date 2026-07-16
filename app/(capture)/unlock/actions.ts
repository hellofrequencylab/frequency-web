'use server'

import { headers } from 'next/headers'
import { rateLimitOk } from '@/lib/rate-limit'
import { parseLeadLink, isSafeHttpUrl } from '@/lib/crm/lead-links'
import { captureLeadMagnet } from '@/lib/crm/lead-capture'
import type { CaptureSubmitResult } from '@/components/crm/leads/capture-form'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * FRONT DOOR #4 — consent-native lead magnet. The download / unlock IS the opt-in, so a captured lead
 * is sealed MAILABLE ('subscribed'). Public + unauthenticated: honeypot-guarded, rate-limited per IP,
 * and ANTI-ENUMERATION (the same success whether or not the address already existed). The Space and
 * magnet come ONLY from the signed token, never the client — so nobody can seal a lead into a Space
 * they weren't handed a link for. Fail-safe: a capture error never blocks the reveal.
 */
export async function captureUnlock(input: {
  token: string
  name: string
  email: string
  phone: string
  company: string
}): Promise<CaptureSubmitResult> {
  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim() || null

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  const payload = parseLeadLink(input.token)
  if (!payload || payload.d !== 'lead_magnet') {
    return { ok: false, error: 'This link is no longer valid. Ask whoever shared it for a new one.' }
  }

  const reveal = isSafeHttpUrl(payload.r) ? { href: payload.r as string, label: 'Open it now' } : undefined

  // A filled honeypot is a bot: show the same success, write nothing.
  if ((input.company || '').trim()) {
    return { ok: true, heading: "You're in.", ...(reveal ? { link: reveal } : { message: 'Check your email.' }) }
  }

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('lead_unlock', ip, 8, '10 m'))) {
    return { ok: false, error: 'Too many tries. Give it a few minutes and try again.' }
  }

  // Consent-native capture: the engine seals this lead 'subscribed'. Best-effort — never surface a
  // DB error to a visitor, and never reveal whether they were already on the list.
  await captureLeadMagnet({
    spaceId: payload.s,
    email,
    displayName: name,
    magnetLabel: payload.l ?? null,
  }).catch(() => null)

  return {
    ok: true,
    heading: "You're in.",
    ...(reveal ? { link: reveal } : { message: "It's on its way to your inbox." }),
  }
}

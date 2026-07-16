'use server'

import { headers } from 'next/headers'
import { isSuppressed } from '@/lib/suppression'
import { resolveAcquisition } from '@/lib/attribution/server'
import { rateLimitOk } from '@/lib/rate-limit'
import { sendOptinConfirmEmail } from '@/lib/email'
import { requestOptin } from '@/lib/crm/optin/store'
import { buildOptinConfirmUrl } from '@/lib/crm/optin/tokens'
import { SITE_URL } from '@/lib/site'

export type OptinResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Inbound double-opt-in request. A person enters their own email on the public /subscribe page.
 * We find-or-create their contact in the Frequency root space and, when appropriate, send ONE
 * transactional confirm email (a permission request, not marketing). We NEVER reveal whether the
 * email already existed, was suppressed, or had opted out: every non-validation path returns the
 * SAME success so the endpoint cannot be used to enumerate addresses.
 */
export async function requestSubscribe(input: { email: string; name?: string }): Promise<OptinResult> {
  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim() || null

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  // Throttle this open, unauthenticated endpoint per IP (abuse / enumeration guard). No-ops when
  // Upstash isn't configured (lib/rate-limit.ts).
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('subscribe', ip, 5, '10 m'))) {
    return { ok: false, error: 'Too many tries. Give it a few minutes and try again.' }
  }

  const suppressed = await isSuppressed(email)
  const acquisition = await resolveAcquisition()

  const outcome = await requestOptin({
    email,
    name,
    suppressed,
    source: 'subscribe_optin',
    acquisition,
  })

  // Only a fresh unknown/new contact gets a confirm email. Every other branch (subscribed,
  // unsubscribed, suppressed, write-failure) sends nothing but still returns the same success.
  if (outcome.action === 'send_confirm' && outcome.emailToConfirm) {
    try {
      const confirmUrl = buildOptinConfirmUrl(SITE_URL, outcome.emailToConfirm)
      await sendOptinConfirmEmail({ to: outcome.emailToConfirm, confirmUrl, firstName: name })
    } catch (err) {
      console.error('[subscribe] failed to queue confirm email:', err)
      // Don't leak the failure detail; a generic retry keeps the anti-enumeration posture.
      return { ok: false, error: 'Something went wrong on our end. Please try again.' }
    }
  }

  return { ok: true }
}

'use server'

import { verifyOptinToken } from '@/lib/crm/optin/tokens'
import { confirmOptin } from '@/lib/crm/optin/store'
import { getRootSpaceId } from '@/lib/crm/import/store'
import { sendOptinWelcomeEmail } from '@/lib/email'
import { buildSpaceUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'

export type ConfirmResult = { ok: true } | { ok: false }

/**
 * The AFFIRMATIVE confirm step for the inbound double-opt-in. Consent flips ONLY on this POST (an
 * explicit button click), never on GET page-load — a link scanner or inbox prefetcher opening the
 * confirm email must not subscribe anyone. We RE-VERIFY the stateless HMAC token here (never trust
 * the client) before the idempotent confirmOptin flip, then best-effort send the welcome email once.
 * A missing/expired/forged token, or a honored hard opt-out, returns { ok: false } so the page shows
 * its friendly retry state; re-confirming an already-subscribed contact is a no-op success.
 */
export async function confirmSubscribe(input: { e: string; x: string; t: string }): Promise<ConfirmResult> {
  const email = (input.e || '').trim().toLowerCase()
  const exp = Number(input.x)
  if (!email || !input.t || !verifyOptinToken(email, exp, input.t)) {
    return { ok: false }
  }

  const result = await confirmOptin(email)
  if (result.status !== 'confirmed') return { ok: false }

  // Send the welcome email exactly once, only on a brand-new confirmation. Best-effort: a queue
  // hiccup never changes what the confirmed person sees on the page.
  if (result.firstConfirmation) {
    try {
      const rootId = await getRootSpaceId()
      const unsubscribeUrl = rootId
        ? buildSpaceUnsubscribeUrl({ baseUrl: SITE_URL.replace(/\/$/, ''), spaceId: rootId, email })
        : `${SITE_URL.replace(/\/$/, '')}/unsubscribe`
      await sendOptinWelcomeEmail({ to: email, firstName: result.displayName, unsubscribeUrl })
    } catch (err) {
      console.error('[subscribe] welcome email failed to queue:', err)
    }
  }

  return { ok: true }
}

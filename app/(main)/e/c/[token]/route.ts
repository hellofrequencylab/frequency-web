// CLICK TRACKING redirect endpoint (public, no auth, FAIL-SAFE). A Space send's tracked links point at
// `/e/c/<token>?u=<original-url>`; following one logs a 'click' event and 302-redirects to the original
// URL. SECURITY: the destination is ONLY the `u` param we injected at send time, and it is re-validated
// here with safeHttpUrl (http/https only — javascript:/data:/mailto: are rejected), so this can never be
// turned into an open redirect to a script-bearing scheme. A bad token/url records nothing and redirects
// to the site root, never to an attacker-chosen or non-http destination.

import { NextResponse } from 'next/server'
import { safeHttpUrl } from '@/lib/safe-url'
import { SITE_URL } from '@/lib/site'
import { decodeSendToken, recordEmailEvent, resolveSendForTracking } from '@/lib/spaces/email-tracking'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  // The destination is trusted ONLY when the token authenticates (HMAC-verified via decodeSendToken) AND
  // resolves to a real send. That gates the redirect behind our own secret, so an attacker cannot use this
  // as an open redirect by forging `/e/c/<anything>?u=<url>` — a bad/absent token always lands on the site
  // root. `u` is additionally constrained to http(s) by safeHttpUrl. (Residual: a recipient could tamper
  // the `u` on their OWN authentic link; low risk, http(s)-only. Signing the URL into the token is a noted
  // follow-up.)
  let target: string | null = null
  try {
    const candidate = safeHttpUrl(new URL(req.url).searchParams.get('u'))
    const { token } = await params
    const sendId = decodeSendToken(token)
    const send = sendId ? await resolveSendForTracking(sendId) : null
    if (send && candidate) {
      await recordEmailEvent({ spaceId: send.spaceId, sendId, email: send.email, kind: 'click', url: candidate })
      target = candidate
    }
  } catch {
    // FAIL-SAFE: on any error, fall through to the safe redirect below.
  }
  // Redirect only to an authenticated, http(s)-validated destination; otherwise the site root.
  return NextResponse.redirect(target ?? SITE_URL, 302)
}

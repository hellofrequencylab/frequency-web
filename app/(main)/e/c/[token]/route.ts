// CLICK TRACKING redirect endpoint (public, no auth, FAIL-SAFE). A Space send's tracked links point at
// `/e/c/<token>?u=<original-url>&s=<sig>`; following one logs a 'click' event and 302-redirects to the URL.
// SECURITY: the destination is trusted ONLY when (a) the token authenticates (HMAC via decodeSendToken)
// and resolves to a real send, and (b) `s` is a valid HMAC BINDING the exact `u` to that token
// (verifyClickUrl). So `u` cannot be swapped even by a recipient holding a real token — no open redirect.
// `u` is additionally http(s)-only (safeHttpUrl). Anything short of all checks lands on the site root.

import { NextResponse } from 'next/server'
import { safeHttpUrl } from '@/lib/safe-url'
import { SITE_URL } from '@/lib/site'
import { decodeSendToken, recordEmailEvent, resolveSendForTracking, verifyClickUrl } from '@/lib/spaces/email-tracking'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  let target: string | null = null
  try {
    const sp = new URL(req.url).searchParams
    const { token } = await params
    const candidate = safeHttpUrl(sp.get('u'))
    // The signature check runs first and on every request, so nothing the request carries decides
    // whether it runs (HYG-143, CodeQL js/user-controlled-bypass). It is also the cheap check: a forged
    // or swapped link is refused before the send lookup touches the database.
    const bound = verifyClickUrl(token, candidate, sp.get('s'))
    const sendId = decodeSendToken(token)
    const send = bound && sendId ? await resolveSendForTracking(sendId) : null
    if (bound && sendId && send && candidate) {
      // Trust the destination BEFORE the best-effort event write, so a record failure never sends the
      // recipient to the site root instead of the link they clicked.
      target = candidate
      await recordEmailEvent({ spaceId: send.spaceId, sendId, email: send.email, kind: 'click', url: candidate })
    }
  } catch {
    // FAIL-SAFE: on any error, fall through to the safe redirect below.
  }
  // Redirect only to an authenticated, signature-bound, http(s)-validated destination; else the site root.
  return NextResponse.redirect(target ?? SITE_URL, 302)
}

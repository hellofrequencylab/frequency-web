// START the Google contacts import (ADR-374). The "Import from Google" button links here; we mint a
// CSRF-safe signed state bound to the member and 302 them to Google's consent screen. No-ops cleanly
// when signed out (→ sign-in) or unconfigured (→ contacts with ?import=unavailable). nodejs runtime
// (the state HMAC uses node:crypto); force-dynamic (it reads the session).

import { NextResponse } from 'next/server'
import { contactsOwnerId } from '@/lib/connections/access'
import {
  GOOGLE_CONTACTS_SCOPE,
  googleClientId,
  googleImportConfigured,
  googleRedirectUri,
} from '@/lib/integrations/google/config'
import { signState } from '@/lib/integrations/google/state'
import { buildAuthUrl } from '@/lib/integrations/google/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)

  const ownerId = await contactsOwnerId()
  if (!ownerId) {
    return NextResponse.redirect(`${origin}/sign-in?next=${encodeURIComponent('/network/contacts')}`)
  }
  if (!googleImportConfigured()) {
    return NextResponse.redirect(`${origin}/network/contacts?import=unavailable`)
  }

  const url = buildAuthUrl({
    clientId: googleClientId()!,
    redirectUri: googleRedirectUri(origin),
    state: signState(ownerId),
    scope: GOOGLE_CONTACTS_SCOPE,
  })
  return NextResponse.redirect(url)
}

// Google contacts import CALLBACK (ADR-374). Google redirects here after consent. We re-resolve the
// session, verify the signed state is bound to THIS member (CSRF defense), exchange the one-time code
// for a short-lived access token (no refresh token stored, access_type=online), pull + dedupe the
// member's contacts, and bounce back to My Contacts with a result banner. Every failure path lands on
// /network/contacts with an ?import= outcome, never a raw error. nodejs runtime; force-dynamic.

import { NextResponse } from 'next/server'
import { contactsOwnerId } from '@/lib/connections/access'
import {
  googleClientId,
  googleClientSecret,
  googleImportConfigured,
  googleRedirectUri,
} from '@/lib/integrations/google/config'
import { verifyState } from '@/lib/integrations/google/state'
import { exchangeCodeForTokens } from '@/lib/integrations/google/oauth'
import { importGoogleContacts } from '@/lib/integrations/google/import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Bounce back to My Contacts with an outcome the result banner reads. */
function back(origin: string, params: Record<string, string>): NextResponse {
  const sp = new URLSearchParams(params)
  return NextResponse.redirect(`${origin}/network/contacts?${sp.toString()}`)
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)

  const ownerId = await contactsOwnerId()
  if (!ownerId) {
    return NextResponse.redirect(`${origin}/sign-in?next=${encodeURIComponent('/network/contacts')}`)
  }
  if (!googleImportConfigured()) return back(origin, { import: 'unavailable' })

  // The member declined consent (or Google returned an error).
  if (searchParams.get('error')) return back(origin, { import: 'cancelled' })

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || !verifyState(state, ownerId)) return back(origin, { import: 'error' })

  const tokens = await exchangeCodeForTokens({
    code,
    clientId: googleClientId()!,
    clientSecret: googleClientSecret()!,
    redirectUri: googleRedirectUri(origin),
  })
  if (!tokens) return back(origin, { import: 'error' })

  const result = await importGoogleContacts(ownerId, tokens.accessToken)
  return back(origin, {
    import: 'done',
    added: String(result.added),
    skipped: String(result.skipped),
  })
}

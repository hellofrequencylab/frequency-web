// DOMAIN CONNECT RETURN (LIVE-780). The `redirect_uri` on Frequency's signed apply URL: after a Space
// owner approves (or cancels) at their DNS provider, the provider sends them here with the `state` we
// minted. The state is HMAC-signed and carries the Space slug, so this route only ever lands on that
// Space's Profile & Settings on this origin, where the Domain section's auto re-check confirms the
// records. Anything unsigned, tampered or stale goes to the home page: never an open redirect.
// A signed-out owner signs in first and comes back to the same place. Reads nothing from the
// database and writes nothing. nodejs runtime (node:crypto); force-dynamic (it reads the session).

import { NextResponse } from 'next/server'
import { getCallerProfile } from '@/lib/auth'
import { domainConnectReturnPath, readDomainConnectState } from '@/lib/sites/domain-connect/state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const slug = readDomainConnectState(searchParams.get('state'))
  if (!slug) return NextResponse.redirect(`${origin}/`)

  const target = domainConnectReturnPath(slug)
  const caller = await getCallerProfile()
  if (!caller) return NextResponse.redirect(`${origin}/sign-in?next=${encodeURIComponent(target)}`)
  return NextResponse.redirect(`${origin}${target}`)
}

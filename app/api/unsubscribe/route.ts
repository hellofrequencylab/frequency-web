// RFC 8058 one-click unsubscribe POST endpoint.
//
// Mailbox providers (Gmail, Yahoo, etc.) POST here when a user clicks
// their inbox-rendered unsubscribe button. The body is form-encoded
// `List-Unsubscribe=One-Click`; query params carry the token.
//
// Must respond 200 quickly. Errors get logged but we don't reveal whether
// the profile exists.

import { NextRequest, NextResponse } from 'next/server'
import { processUnsubscribe, processSpaceUnsubscribe } from '@/app/unsubscribe/actions'
import { isError, type ActionResult } from '@/lib/action-result'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const t = searchParams.get('t') ?? ''

  // Per-Space one-click (ENTITY-SPACES-BUILD Phase 3): `s` (space) + `e` (email) records a
  // space-scoped suppression. Otherwise fall back to the GLOBAL member unsubscribe (`p` + `c`).
  const s = searchParams.get('s')
  const e = searchParams.get('e')
  const result: ActionResult<unknown> =
    s || e
      ? await processSpaceUnsubscribe({ spaceId: s ?? '', email: e ?? '', token: t })
      : await processUnsubscribe({
          profileId: searchParams.get('p') ?? '',
          category: searchParams.get('c') ?? '',
          token: t,
        })

  if (isError(result)) {
    // Log the reason internally but return 200 so the mailbox UI shows
    // success. (Revealing the failure invites probing.)
    console.warn('[api/unsubscribe] unsubscribe failed:', result.error)
  }

  return NextResponse.json({ ok: true })
}

// Some clients also send a GET probe before the POST — accept it.
export async function GET(req: NextRequest) {
  return POST(req)
}

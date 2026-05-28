// RFC 8058 one-click unsubscribe POST endpoint.
//
// Mailbox providers (Gmail, Yahoo, etc.) POST here when a user clicks
// their inbox-rendered unsubscribe button. The body is form-encoded
// `List-Unsubscribe=One-Click`; query params carry the token.
//
// Must respond 200 quickly. Errors get logged but we don't reveal whether
// the profile exists.

import { NextRequest, NextResponse } from 'next/server'
import { processUnsubscribe } from '@/app/unsubscribe/actions'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const p = searchParams.get('p') ?? ''
  const c = searchParams.get('c') ?? ''
  const t = searchParams.get('t') ?? ''

  const result = await processUnsubscribe({ profileId: p, category: c, token: t })

  if (!result.ok) {
    // Log the reason internally but return 200 so the mailbox UI shows
    // success. (Revealing the failure invites probing.)
    console.warn('[api/unsubscribe] processUnsubscribe failed:', result.error)
  }

  return NextResponse.json({ ok: true })
}

// Some clients also send a GET probe before the POST — accept it.
export async function GET(req: NextRequest) {
  return POST(req)
}

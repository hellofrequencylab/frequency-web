import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/sites/host'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { calendarProvider, calendarSyncReady, exchangeCalendarCode } from '@/lib/calendar-sync/oauth'
import { completeSyncConnection, deleteSyncConnection, findPendingConnection } from '@/lib/calendar-sync/store'
import { runCalendarSync } from '@/lib/calendar-sync/run'

// THE CALENDAR SYNC OAUTH CALLBACK (LIVE-1179, ADR-1976). Google sends the browser back here with a
// one-use `state` and a code. The state names a pending connection that only the Space's owner or
// admins can read (RLS), and its nonce must match before anything is exchanged; the PKCE verifier
// sealed at start is the second proof. Every outcome redirects to the calendar settings with a
// short `sync=` word and nothing else, no-store, no referrer.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Outcome = 'connected' | 'cancelled' | 'unavailable' | 'expired' | 'failed'

function back(slug: string | null, outcome: Outcome) {
  const path = slug ? `/spaces/${encodeURIComponent(slug)}/settings/calendar` : '/spaces'
  const response = NextResponse.redirect(`${appOrigin()}${path}?sync=${outcome}`)
  response.headers.set('cache-control', 'no-store')
  response.headers.set('referrer-policy', 'no-referrer')
  return response
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = calendarProvider((await params).provider)
  if (!provider || !calendarSyncReady(provider)) return back(null, 'unavailable')
  const query = new URL(request.url).searchParams
  const states = query.getAll('state')
  if (states.length !== 1) return back(null, 'expired')

  const caller = await getCallerProfile()
  if (!caller?.id) return back(null, 'expired')
  const pending = await findPendingConnection(provider, states[0])
  if (!pending) return back(null, 'expired')

  // Fresh authority: the person finishing the connect must still own or admin the Space, with Events on.
  const space = await getSpaceById(pending.connection.spaceId)
  const caps = space ? await getSpaceCapabilities(space, caller.id) : null
  const slug = space?.slug ?? null
  if (!space || !caps?.isAdmin || !spaceFunctionAccess(space, 'events', caps.role)) return back(slug, 'expired')

  const code = query.get('code')
  if (query.has('error') || !code) {
    await deleteSyncConnection(space.id, provider)
    return back(slug, 'cancelled')
  }
  const tokens = await exchangeCalendarCode(provider, code, pending.verifier)
  if (!tokens || !(await completeSyncConnection(pending.connection, pending.nonceHash, tokens))) {
    await deleteSyncConnection(space.id, provider)
    return back(slug, 'failed')
  }
  // The first sync runs now, so the calendar shows the result the moment the page comes back.
  await runCalendarSync({ id: space.id, timeZone: space.timeZone ?? null }, provider, caller.id)
  return back(slug, 'connected')
}

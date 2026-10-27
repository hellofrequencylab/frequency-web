import { NextResponse } from 'next/server'
import { parseSearchOAuthState } from '@/lib/ai/discovery-oauth-state'
import { appOrigin } from '@/lib/sites/host'
import { authorizeDiscoveryEditor } from '@/lib/spaces/discovery-access'
import { consumeSearchConnection, invalidateSearchConnection, saveSearchConnection } from '@/lib/ai/discovery-connection-store'
import { resolveSearchAccess, verifySearchConnection } from '@/lib/ai/discovery-search-runtime'
import { exchangeSearchCode, searchProvider } from '@/lib/integrations/discovery/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
function back(path = '/spaces/operating', outcome = 'unavailable') {
  const response = NextResponse.redirect(`${appOrigin()}${path}${path.includes('?') ? '&' : '?'}search=${outcome}`)
  response.headers.set('cache-control', 'no-store')
  response.headers.set('referrer-policy', 'no-referrer')
  return response
}
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = searchProvider((await params).provider), query = new URL(request.url).searchParams
  if (!provider) return back()
  const states = query.getAll('state')
  if (states.length === 0 || (states.length === 1 && states[0] === '')) return back('/spaces/operating', 'missing_state')
  if (states.length !== 1 || !parseSearchOAuthState(states[0])) return back('/spaces/operating', 'malformed_state')
  // Atomic consume binds the current actor, Space, purpose grant and one-time PKCE verifier.
  const attempt = await consumeSearchConnection(provider, states[0])
  if (!attempt) return back('/spaces/operating', 'rejected_state')
  const editor = await authorizeDiscoveryEditor(attempt.binding.spaceId)
  const freshAccess = await resolveSearchAccess(attempt.binding.spaceId)
  const path = editor ? `/spaces/${encodeURIComponent(editor.space.slug)}/settings/coach` : '/spaces/operating'
  if (!editor || editor.actor !== attempt.binding.actorProfileId || !freshAccess || freshAccess.actorProfileId !== attempt.binding.actorProfileId || freshAccess.consent.id !== attempt.binding.consentId) { await invalidateSearchConnection(attempt.binding); return back() }
  if (query.has('error') || !query.get('code')) { await invalidateSearchConnection(attempt.binding); return back(path, 'cancelled') }
  try {
    const tokens = await exchangeSearchCode(provider, query.get('code')!, attempt.verifier)
    if (!tokens || !(await verifySearchConnection(attempt.binding, tokens)) || !(await saveSearchConnection(attempt.binding, tokens))) { await invalidateSearchConnection(attempt.binding); return back(path) }
    return back(path, 'connected')
  } catch { await invalidateSearchConnection(attempt.binding); return back(path) }
}

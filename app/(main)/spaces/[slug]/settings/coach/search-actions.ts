'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authorizeDiscoveryEditor } from '@/lib/spaces/discovery-access'
import { rateLimitOk } from '@/lib/rate-limit'
import { beginSearchConnection, disconnectSearchConnection } from '@/lib/ai/discovery-connection-store'
import { reviewSearchSignals, searchPropertyAllowed } from '@/lib/ai/discovery-search-runtime'
import { searchProvider, searchAuthorizationUrl, searchOAuthConfig } from '@/lib/integrations/discovery/oauth'

/** Server Action Origin/Host verification supplies CSRF protection; no GET starts an OAuth grant. */
export async function startSearchProvider(spaceId: string, selected: string, form: FormData) {
  const provider = searchProvider(selected), editor = await authorizeDiscoveryEditor(spaceId)
  if (!provider || !editor) return
  const path = `/spaces/${encodeURIComponent(editor.space.slug)}/settings/coach`
  const property = form.get('property')
  if (!searchOAuthConfig(provider) || typeof property !== 'string' || !(await rateLimitOk('discovery-search-connect', `${provider}:${spaceId}:${editor.actor}`, 3, '10 m'))) redirect(`${path}?search=setup_required`)
  const propertyScope = await searchPropertyAllowed(spaceId, provider, property)
  if (!propertyScope) redirect(`${path}?search=property_scope_unavailable`)
  const attempt = await beginSearchConnection(spaceId, provider, property, propertyScope)
  const url = attempt ? searchAuthorizationUrl(provider, attempt.state, attempt.challenge) : null
  redirect(url ?? `${path}?search=unavailable`)
}
export async function disconnectSearchProvider(spaceId: string, selected: string) {
  const provider = searchProvider(selected), editor = await authorizeDiscoveryEditor(spaceId)
  if (!provider || !editor) return { success: false }
  const success = await disconnectSearchConnection(spaceId, provider)
  revalidatePath(`/spaces/${encodeURIComponent(editor.space.slug)}/settings/coach`)
  return { success }
}
export async function reviewConnectedSearch(spaceId: string, selected: string) {
  const provider = searchProvider(selected)
  return provider ? reviewSearchSignals(spaceId, provider) : { status: 'unavailable' as const, reason: 'invalid_provider' }
}

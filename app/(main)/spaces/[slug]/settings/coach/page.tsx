import { SearchConnectionNotice } from '@/components/spaces/search-connection-notice'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { loadSpaceDiscoveryConsent, loadSpaceCoachProfile } from '@/lib/spaces/private-state'
import { ConsoleFocusTemplate } from '@/components/templates/console-templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { CoachProfileForm } from '@/components/spaces/coach-profile-form'
import { authorizeDiscoveryEditor } from '@/lib/spaces/discovery-access'
import { DiscoveryCoachingPanel } from '@/components/spaces/discovery-coaching-panel'
import { DiscoverySearchPanel } from '@/components/spaces/discovery-search-panel'
import { readSearchConnectionStatus } from '@/lib/ai/discovery-connection-store'
import { searchOAuthConfig } from '@/lib/integrations/discovery/oauth'
import { discoveryConsentActive } from '@/lib/spaces/discovery-consent'
import { consoleBack } from '@/lib/spaces/console-back'

export const metadata = { title: 'Coach preferences' }
export default async function SpaceCoachPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ search?: string }> }) {
  const { slug } = await params
  const outcome = (await searchParams)?.search
  const searchNotice: Record<string, string> = { connected: 'Your search property is connected. You can request a review below.', cancelled: 'Provider authorization was cancelled. No search review was run.', unavailable: 'The search connection could not be completed. Check provider access and try again.', setup_required: 'Search account setup or request cooldown needs attention. No connection was created.', property_scope_unavailable: 'That property does not match this Space’s approved pages. Bing requires its published website root.' }
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  const discoveryEditor = canManage && !staffViewing ? await authorizeDiscoveryEditor(space.id) : null
  const coach = discoveryEditor ? await loadSpaceCoachProfile(space.id) : null
  const discovery = discoveryEditor ? await loadSpaceDiscoveryConsent(space.id) : null
  const search = discoveryEditor ? await Promise.all(([['google', 'google_search_console'], ['bing', 'bing_webmaster']] as const).map(async ([provider, id]) => ({ provider, configured: !!searchOAuthConfig(id), status: await readSearchConnectionStatus(space.id, id) }))) : []
  return <ConsoleFocusTemplate back={consoleBack(slug, 'settings')} eyebrow={space.brandName ?? space.name} title="Coach preferences" description="Help Vera ask better questions about your Space." width="wide">
    {staffViewing && <StaffPreviewBanner spaceName={space.brandName ?? space.name} />}
    <><SearchConnectionNotice outcome={outcome} />{outcome && searchNotice[outcome] && <p role="status">{searchNotice[outcome]}</p>}{!coach ? <p role="status">Coach preferences are private to the owner and editors of this Space.</p> : coach.available ? <CoachProfileForm key={space.id} spaceId={space.id} initial={coach.profile} readOnly={false} /> : <p role="status">Coach preferences are unavailable. Your existing Space profile is unchanged. Try again after setup is complete.</p>}
    {discovery && <DiscoveryCoachingPanel key={`discovery-${space.id}`} spaceId={space.id} initial={discovery.consent} available={discovery.available} />}
    {discoveryEditor && <DiscoverySearchPanel key={`search-${space.id}-${discovery?.consent?.id ?? 'none'}-${discovery?.consent?.revokedAt ?? 'active'}`} spaceId={space.id} allowed={discoveryConsentActive(discovery?.consent ?? null)} providers={search} />}
    </>
  </ConsoleFocusTemplate>
}

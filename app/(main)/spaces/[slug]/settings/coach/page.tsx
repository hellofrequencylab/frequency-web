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
import { consoleBack } from '@/lib/spaces/console-back'

export const metadata = { title: 'Coach preferences' }
export default async function SpaceCoachPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  const discoveryEditor = canManage && !staffViewing ? await authorizeDiscoveryEditor(space.id) : null
  const coach = discoveryEditor ? await loadSpaceCoachProfile(space.id) : null
  const discovery = discoveryEditor ? await loadSpaceDiscoveryConsent(space.id) : null
  return <ConsoleFocusTemplate back={consoleBack(slug, 'settings')} eyebrow={space.brandName ?? space.name} title="Coach preferences" description="Help Vera ask better questions about your Space." width="wide">
    {staffViewing && <StaffPreviewBanner spaceName={space.brandName ?? space.name} />}
    <>{!coach ? <p role="status">Coach preferences are private to the owner and editors of this Space.</p> : coach.available ? <CoachProfileForm key={space.id} spaceId={space.id} initial={coach.profile} readOnly={false} /> : <p role="status">Coach preferences are unavailable. Your existing Space profile is unchanged. Try again after setup is complete.</p>}
    {discovery && <DiscoveryCoachingPanel key={`discovery-${space.id}`} spaceId={space.id} initial={discovery.consent} available={discovery.available} />}
    </>
  </ConsoleFocusTemplate>
}

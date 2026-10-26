import { canCreate } from '@/lib/core/load-capabilities'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { getMyProfileId } from '@/lib/auth'
import { getMyPlans, listPublicPlans } from '@/lib/journey-plans'
import { getMemberJourneyProgress } from '@/lib/journeys/progress'
import { JourneysIndexBody } from '@/components/frequency/members/journey/journeys-index-body'
import { visibleModuleOrder } from '@/components/frequency/members/shared/module-order'

// The Journeys browse + build page. Module-driven (ADR-270/294): the page resolves its
// operator-editable header (ADR-180) and composes the IndexTemplate chrome, then renders
// <PageModules>, which lays out the page's blocks (the two ways in, your journeys, the community
// library) in the operator-chosen template + order. Staff arrange it from the on-page
// Settings → Layout panel (the route is registered in lib/widgets/module-routes.ts). Each block is
// a self-fetching RSC in components/widgets/journeys/.

// Coded defaults for the operator-editable header content (ADR-180).
const CONTENT_FALLBACK = {
  title: 'Journeys',
  description: 'The library to browse and build Journeys: guided tracks of Practices across Mind, Body, Spirit, and Expression. Keep one for yourself, or share it to the open library for anyone to adopt. This season’s official Quest lives in My Quest.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2);
// the fallback strings are the page's previous static metadata, unchanged. The canonical
// discover twin is /discover/journeys, so we override the helper's self-canonical to point
// there and consolidate ranking signals on the discover surface.
export async function generateMetadata() {
  const meta = await pageContentMetadata('/journeys', {
    title: 'Journeys',
    description: 'Build a journey from the practices you love and share it with the community.',
  })
  return { ...meta, alternates: { ...meta.alternates, canonical: '/discover/journeys' } }
}

export default async function JourneysPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams
  const query = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 80) ?? ''
  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, body, ctaLabel, ctaHref } =
    await resolvePageContent('/journeys', CONTENT_FALLBACK)
  // Any signed-in member may build (FIRST ONE FREE, ADR-920); signed-out gets a sign-in door.
  const canBuildJourney = await canCreate('journey.create')
  const profileId = await getMyProfileId()
  const [order, progress, mine, library] = await Promise.all([
    visibleModuleOrder('/journeys'),
    profileId ? getMemberJourneyProgress(profileId, { activeOnly: false }) : Promise.resolve([]),
    profileId ? getMyPlans(profileId) : Promise.resolve(null),
    listPublicPlans(),
  ])
  return (
    <JourneysIndexBody
      title={title}
      description={description}
      intro={body}
      cta={ctaLabel && ctaHref ? { label: ctaLabel, href: ctaHref } : null}
      canBuild={canBuildJourney}
      order={order}
      progress={progress}
      mine={mine}
      library={library.filter((p) => p.author_id !== profileId)}
      query={query}
    />
  )
}
